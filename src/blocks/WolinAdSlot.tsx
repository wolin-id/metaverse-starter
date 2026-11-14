import { Html } from '@react-three/drei';
import { type ThreeElements, useFrame, useThree } from '@react-three/fiber';
import {
  type ReactElement,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';

export interface SpatialAdCreative {
  adId: string;
  headline: string;
  subline: string;
  ctaLabel: string;
  destinationUrl: string;
  accentColor?: string;
}

export const DEFAULT_HOUSE_AD: SpatialAdCreative = {
  adId: 'house-wolin-passport-v1',
  headline: 'WOLIN PASSPORT',
  subline: 'One Identity. Infinite Worlds. Claim {handle}.wolin.id',
  ctaLabel: 'wolin.id',
  destinationUrl: 'https://wolin.id',
  accentColor: '#38bdf8',
};

export interface ViewableImpressionPayload {
  slotId: string;
  adId: string;
  worldContext: string;
  dwellMs: number;
  screenAreaRatio: number;
  distance: number;
  impressionToken: string;
  timestamp: number;
}

export interface SpatialFrameMetrics {
  inFrustum: boolean;
  facingCamera: boolean;
  withinDistance: boolean;
  occluded: boolean;
  screenAreaRatio: number;
  distance: number;
  isViewable: boolean;
}

export interface EvaluateSpatialAdFrameParams {
  camera: THREE.Camera;
  slotWorldCenter: THREE.Vector3;
  slotWorldQuaternion: THREE.Quaternion;
  width: number;
  height: number;
  occluderRoots?: readonly THREE.Object3D[];
  ignoredRoot?: THREE.Object3D | null;
  minScreenAreaRatio?: number;
  maxDistance?: number;
  minFacingCos?: number;
  raycaster?: THREE.Raycaster;
}

export interface ViewabilityAccumulatorState {
  continuousDwellMs: number;
  hasFiredImpression: boolean;
}

/**
 * Pure MRC-3D Viewability frame evaluator:
 * 1. Camera Frustum check
 * 2. Front-facing normal check (`dot >= minFacingCos`)
 * 3. Readable distance check (`distance <= maxDistance`)
 * 4. Projected NDC screen-area ratio check (`>= minScreenAreaRatio`, default 5% = `0.05`)
 * 5. Raycast line-of-sight occlusion check against scene meshes
 */
export function evaluateSpatialAdFrame({
  camera,
  slotWorldCenter,
  slotWorldQuaternion,
  width,
  height,
  occluderRoots = [],
  ignoredRoot = null,
  minScreenAreaRatio = 0.05,
  maxDistance = 28,
  minFacingCos = 0.15,
  raycaster = new THREE.Raycaster(),
}: EvaluateSpatialAdFrameParams): SpatialFrameMetrics {
  camera.updateMatrixWorld();

  const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const toCamera = camPos.clone().sub(slotWorldCenter);
  const distance = toCamera.length();
  const withinDistance = distance > 0.25 && distance <= maxDistance;

  const toCameraDir = distance > 0.0001 ? toCamera.clone().divideScalar(distance) : new THREE.Vector3(0, 0, 1);
  const slotNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(slotWorldQuaternion).normalize();
  const facingCamera = slotNormal.dot(toCameraDir) >= minFacingCos;

  const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  const frustum = new THREE.Frustum().setFromProjectionMatrix(projScreenMatrix);
  const boundingRadius = Math.hypot(width * 0.5, height * 0.5);
  const inFrustum = frustum.intersectsSphere(new THREE.Sphere(slotWorldCenter, boundingRadius));

  // Project the 4 world-space corners of the billboard quad into NDC [-1, 1]
  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const localCorners = [
    new THREE.Vector3(-halfW, -halfH, 0),
    new THREE.Vector3(halfW, -halfH, 0),
    new THREE.Vector3(halfW, halfH, 0),
    new THREE.Vector3(-halfW, halfH, 0),
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let anyCornerInFront = false;

  const projected2D: Array<{ x: number; y: number }> = [];
  for (const corner of localCorners) {
    const worldCorner = corner.applyQuaternion(slotWorldQuaternion).add(slotWorldCenter);
    const viewSpace = worldCorner.clone().applyMatrix4(camera.matrixWorldInverse);
    if (viewSpace.z < -0.05) {
      anyCornerInFront = true;
    }
    const ndc = worldCorner.project(camera);
    const clampedX = THREE.MathUtils.clamp(ndc.x, -1, 1);
    const clampedY = THREE.MathUtils.clamp(ndc.y, -1, 1);
    minX = Math.min(minX, clampedX);
    maxX = Math.max(maxX, clampedX);
    minY = Math.min(minY, clampedY);
    maxY = Math.max(maxY, clampedY);
    projected2D.push({ x: clampedX, y: clampedY });
  }

  // Shoelace area in NDC space (full viewport [-1,1]x[-1,1] has area = 4.0)
  let shoelaceTwiceArea = 0;
  for (let i = 0; i < projected2D.length; i++) {
    const curr = projected2D[i]!;
    const next = projected2D[(i + 1) % projected2D.length]!;
    shoelaceTwiceArea += curr.x * next.y - next.x * curr.y;
  }
  const polygonAreaRatio = Math.abs(shoelaceTwiceArea) * 0.5 * 0.25;
  const bboxAreaRatio = Math.max(0, maxX - minX) * Math.max(0, maxY - minY) * 0.25;
  const screenAreaRatio = anyCornerInFront
    ? Math.min(1, Math.max(polygonAreaRatio, bboxAreaRatio * 0.85))
    : 0;

  // Raycast line-of-sight check from camera to billboard center
  let occluded = false;
  if (inFrustum && facingCamera && withinDistance && screenAreaRatio >= minScreenAreaRatio && occluderRoots.length > 0) {
    const rayDir = slotWorldCenter.clone().sub(camPos).normalize();
    raycaster.near = 0.1;
    raycaster.far = Math.max(0.2, distance - 0.12);
    raycaster.set(camPos, rayDir);

    const isDescendantOfIgnored = (obj: THREE.Object3D): boolean => {
      if (!ignoredRoot) return false;
      let cur: THREE.Object3D | null = obj;
      while (cur) {
        if (cur === ignoredRoot) return true;
        cur = cur.parent;
      }
      return false;
    };

    const candidateOccluders: THREE.Object3D[] = [];
    for (const root of occluderRoots) {
      root.traverseVisible((obj) => {
        if (
          obj instanceof THREE.Mesh &&
          !isDescendantOfIgnored(obj) &&
          obj.userData?.ignoreAdOcclusion !== true
        ) {
          candidateOccluders.push(obj);
        }
      });
    }

    if (candidateOccluders.length > 0) {
      const hits = raycaster.intersectObjects(candidateOccluders, false);
      if (hits.some((hit) => hit.distance < distance - 0.12)) {
        occluded = true;
      }
    }
  }

  const isViewable =
    inFrustum &&
    facingCamera &&
    withinDistance &&
    !occluded &&
    screenAreaRatio >= minScreenAreaRatio;

  return {
    inFrustum,
    facingCamera,
    withinDistance,
    occluded,
    screenAreaRatio,
    distance,
    isViewable,
  };
}

/**
 * Pure dwell-time state machine:
 * - Accumulates continuous milliseconds only while `isViewableFrame && isUserActive` is true
 * - Resets `continuousDwellMs` to `0` immediately on any non-viewable/occluded frame
 * - Emits `justTriggered: true` exactly once when crossing `requiredDwellMs` (default 1500ms)
 */
export function advanceViewabilityAccumulator(
  prev: ViewabilityAccumulatorState,
  isViewableFrame: boolean,
  deltaMs: number,
  requiredDwellMs = 1500,
  isUserActive = true,
): { next: ViewabilityAccumulatorState; justTriggered: boolean } {
  if (!isViewableFrame || !isUserActive) {
    return {
      next: {
        continuousDwellMs: 0,
        hasFiredImpression: prev.hasFiredImpression,
      },
      justTriggered: false,
    };
  }

  const clampedDelta = Math.max(0, Math.min(deltaMs, 250));
  const nextDwell = prev.continuousDwellMs + clampedDelta;
  const justTriggered = !prev.hasFiredImpression && nextDwell >= requiredDwellMs;

  return {
    next: {
      continuousDwellMs: nextDwell,
      hasFiredImpression: prev.hasFiredImpression || justTriggered,
    },
    justTriggered,
  };
}

export interface UseSpatialAdViewabilityOptions {
  slotRef: RefObject<THREE.Group | null>;
  slotId: string;
  adId: string;
  worldContext?: string;
  width: number;
  height: number;
  minScreenAreaRatio?: number;
  requiredDwellMs?: number;
  maxDistance?: number;
  idleTimeoutMs?: number;
  onViewableImpression?: (payload: ViewableImpressionPayload) => void;
}

export interface SpatialAdViewabilitySnapshot extends SpatialFrameMetrics {
  dwellMs: number;
  impressionVerified: boolean;
}

export function useSpatialAdViewability({
  slotRef,
  slotId,
  adId,
  worldContext = 'lunar-plaza',
  width,
  height,
  minScreenAreaRatio = 0.05,
  requiredDwellMs = 1500,
  maxDistance = 28,
  idleTimeoutMs = 30_000,
  onViewableImpression,
}: UseSpatialAdViewabilityOptions): SpatialAdViewabilitySnapshot {
  const { scene } = useThree();
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const lastInputAtRef = useRef<number>(Date.now());
  const accumRef = useRef<ViewabilityAccumulatorState>({
    continuousDwellMs: 0,
    hasFiredImpression: false,
  });
  const lastUiSyncRef = useRef<number>(0);

  const [snapshot, setSnapshot] = useState<SpatialAdViewabilitySnapshot>({
    inFrustum: false,
    facingCamera: false,
    withinDistance: false,
    occluded: false,
    screenAreaRatio: 0,
    distance: 0,
    isViewable: false,
    dwellMs: 0,
    impressionVerified: false,
  });

  // Reset impression latch when creative changes
  useEffect(() => {
    accumRef.current = { continuousDwellMs: 0, hasFiredImpression: false };
  }, [adId, slotId]);

  // Anti-AFK input freshness tracker (Zero-PII local memory only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const markActive = () => {
      lastInputAtRef.current = Date.now();
    };
    window.addEventListener('pointermove', markActive, { passive: true });
    window.addEventListener('pointerdown', markActive, { passive: true });
    window.addEventListener('wheel', markActive, { passive: true });
    window.addEventListener('keydown', markActive, { passive: true });
    return () => {
      window.removeEventListener('pointermove', markActive);
      window.removeEventListener('pointerdown', markActive);
      window.removeEventListener('wheel', markActive);
      window.removeEventListener('keydown', markActive);
    };
  }, []);

  useFrame(({ camera, clock }, deltaSecs) => {
    const group = slotRef.current;
    if (!group) return;

    group.updateWorldMatrix(true, false);
    const worldCenter = new THREE.Vector3().setFromMatrixPosition(group.matrixWorld);
    const worldQuat = new THREE.Quaternion().setFromRotationMatrix(group.matrixWorld);

    const metrics = evaluateSpatialAdFrame({
      camera,
      slotWorldCenter: worldCenter,
      slotWorldQuaternion: worldQuat,
      width,
      height,
      occluderRoots: [scene],
      ignoredRoot: group,
      minScreenAreaRatio,
      maxDistance,
      raycaster: raycasterRef.current,
    });

    const isUserActive = Date.now() - lastInputAtRef.current <= idleTimeoutMs;
    const { next, justTriggered } = advanceViewabilityAccumulator(
      accumRef.current,
      metrics.isViewable,
      deltaSecs * 1000,
      requiredDwellMs,
      isUserActive,
    );
    accumRef.current = next;

    if (justTriggered && onViewableImpression) {
      const nonce =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      onViewableImpression({
        slotId,
        adId,
        worldContext,
        dwellMs: Math.round(next.continuousDwellMs),
        screenAreaRatio: Number(metrics.screenAreaRatio.toFixed(4)),
        distance: Number(metrics.distance.toFixed(2)),
        impressionToken: `imp_${nonce}`,
        timestamp: Date.now(),
      });
    }

    const elapsedMs = clock.getElapsedTime() * 1000;
    if (justTriggered || elapsedMs - lastUiSyncRef.current >= 120) {
      lastUiSyncRef.current = elapsedMs;
      setSnapshot({
        ...metrics,
        dwellMs: next.continuousDwellMs,
        impressionVerified: next.hasFiredImpression,
      });
    }
  });

  return snapshot;
}

function createHouseAdTexture(creative: SpatialAdCreative): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const accent = creative.accentColor ?? '#38bdf8';
  const grad = ctx.createLinearGradient(0, 0, 1024, 512);
  grad.addColorStop(0, '#090d16');
  grad.addColorStop(0.55, '#111827');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Subtle lunar radial glow
  const radial = ctx.createRadialGradient(840, 130, 20, 840, 130, 260);
  radial.addColorStop(0, 'rgba(56, 189, 248, 0.34)');
  radial.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, 1024, 512);

  // Specular border
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, 976, 464);

  // Sponsored Zero-PII Pill
  ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
  ctx.fillRect(64, 62, 270, 40);
  ctx.fillStyle = accent;
  ctx.font = '700 20px system-ui, -apple-system, sans-serif';
  ctx.fillText('SPATIAL HOUSE AD · ZERO-PII', 80, 89);

  // Headline
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 68px system-ui, -apple-system, sans-serif';
  ctx.fillText(creative.headline, 64, 210);

  // Subline
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 32px system-ui, -apple-system, sans-serif';
  ctx.fillText(creative.subline, 64, 282);

  // CTA Pill
  ctx.fillStyle = accent;
  ctx.fillRect(64, 352, 260, 68);
  ctx.fillStyle = '#090d16';
  ctx.font = '800 28px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Visit ${creative.ctaLabel} ↗`, 92, 396);

  // Crescent Moon Emblem
  ctx.beginPath();
  ctx.arc(855, 256, 86, 0, Math.PI * 2);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(888, 236, 72, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export type WolinAdSlotProps = ThreeElements['group'] & {
  slotId: string;
  worldContext?: string;
  creative?: SpatialAdCreative;
  width?: number;
  height?: number;
  minScreenAreaRatio?: number;
  requiredDwellMs?: number;
  showTelemetryBadge?: boolean;
  onViewableImpression?: (payload: ViewableImpressionPayload) => void;
};

/**
 * Metaverse Lego Block #3: `<WolinAdSlot />`
 *
 * Zero-PII 3D Spatial Billboard with MRC-grade 3D Viewability verification:
 * Frustum + >=5% screen area + Raycast occlusion check + 1.5s continuous dwell timer.
 */
export function WolinAdSlot({
  slotId,
  worldContext = 'lunar-plaza',
  creative = DEFAULT_HOUSE_AD,
  width = 3.6,
  height = 1.8,
  minScreenAreaRatio = 0.05,
  requiredDwellMs = 1500,
  showTelemetryBadge = true,
  onViewableImpression,
  ...groupProps
}: WolinAdSlotProps): ReactElement {
  const slotRef = useRef<THREE.Group>(null);
  const houseTexture = useMemo(() => createHouseAdTexture(creative), [creative]);

  useEffect(() => {
    return () => {
      houseTexture?.dispose();
    };
  }, [houseTexture]);

  const viewability = useSpatialAdViewability({
    slotRef,
    slotId,
    adId: creative.adId,
    worldContext,
    width,
    height,
    minScreenAreaRatio,
    requiredDwellMs,
    onViewableImpression,
  });

  const frameGlowColor = viewability.impressionVerified
    ? '#34d399'
    : viewability.occluded
      ? '#f59e0b'
      : viewability.isViewable
        ? '#38bdf8'
        : '#475569';

  const progressPct = Math.min(100, Math.round((viewability.dwellMs / requiredDwellMs) * 100));

  return (
    <group ref={slotRef} {...groupProps}>
      {/* Support Post */}
      <mesh position={[0, -height * 0.5 - 0.55, -0.06]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 1.1, 12]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.25} />
      </mesh>

      {/* Billboard Chassis */}
      <mesh position={[0, 0, -0.06]} castShadow>
        <boxGeometry args={[width + 0.16, height + 0.16, 0.1]} />
        <meshStandardMaterial color="#0f172a" metalness={0.85} roughness={0.2} />
      </mesh>

      {/* Status Trim Bar */}
      <mesh position={[0, height * 0.5 + 0.1, 0]}>
        <boxGeometry args={[width + 0.16, 0.05, 0.12]} />
        <meshStandardMaterial
          color={frameGlowColor}
          emissive={frameGlowColor}
          emissiveIntensity={1.1}
        />
      </mesh>

      {/* House Ad Creative Surface */}
      <mesh
        position={[0, 0, 0.01]}
        onClick={(e) => {
          e.stopPropagation();
          if (typeof window !== 'undefined') {
            window.open(creative.destinationUrl, '_blank', 'noopener,noreferrer');
          }
        }}
      >
        <planeGeometry args={[width, height]} />
        {houseTexture ? (
          <meshBasicMaterial map={houseTexture} toneMapped={false} />
        ) : (
          <meshStandardMaterial color="#1e293b" />
        )}
      </mesh>

      {showTelemetryBadge && (
        <Html
          position={[0, -height * 0.5 - 0.24, 0.05]}
          center
          distanceFactor={8}
          zIndexRange={[18, 0]}
        >
          <div
            className="ad-telemetry-pill"
            data-verified={viewability.impressionVerified ? 'true' : 'false'}
            data-occluded={viewability.occluded ? 'true' : 'false'}
          >
            <span>
              Area {(viewability.screenAreaRatio * 100).toFixed(1)}% (min{' '}
              {(minScreenAreaRatio * 100).toFixed(0)}%)
            </span>
            <span>·</span>
            <span>
              {viewability.occluded
                ? 'Blocked (Raycast)'
                : viewability.impressionVerified
                  ? 'MRC 1.5s Verified ✓'
                  : `${(viewability.dwellMs / 1000).toFixed(2)}s / ${(
                      requiredDwellMs / 1000
                    ).toFixed(1)}s (${progressPct}%)`}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}
