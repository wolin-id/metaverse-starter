import { MeshReflectorMaterial, OrbitControls, Stars } from '@react-three/drei';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { WolinAuthAndAvatar } from '../blocks';
import { MoonPortals, type SanctuaryPortal } from './MoonPortals';

export type SanctuaryCameraMode = 'explore' | 'meditate' | 'ad-focus' | 'stage-focus';

export interface LotusLanternItem {
  id: string;
  originX: number;
  originZ: number;
  driftVx: number;
  driftVz: number;
  spawnedAtSec: number;
  phase: number;
  petalColor: string;
}

export const INITIAL_LOTUS_LANTERNS: readonly LotusLanternItem[] = [
  {
    id: 'seed-lantern-1',
    originX: -2.35,
    originZ: 3.35,
    driftVx: -0.045,
    driftVz: 0.032,
    spawnedAtSec: 0,
    phase: 0.4,
    petalColor: '#fde68a',
  },
  {
    id: 'seed-lantern-2',
    originX: 2.55,
    originZ: 3.1,
    driftVx: 0.048,
    driftVz: 0.036,
    spawnedAtSec: 0,
    phase: 2.1,
    petalColor: '#fbcfe8',
  },
  {
    id: 'seed-lantern-3',
    originX: -1.8,
    originZ: -5.1,
    driftVx: -0.035,
    driftVz: -0.042,
    spawnedAtSec: 0,
    phase: 4.0,
    petalColor: '#fed7aa',
  },
];

const ISLAND_CENTER_X = 0;
const ISLAND_CENTER_Z = -2.2;
const ISLAND_COLLISION_RADIUS = 3.45;
const LAKE_WALK_MAX_RADIUS = 18.5;

const LOTUS_PETAL_PALETTE = ['#fde68a', '#fbcfe8', '#fed7aa', '#fef08a'] as const;

export function createDriftingLotusLantern(
  seq: number,
  nearPosition: readonly [number, number] = [0, 4.1],
  nowSec = 0,
): LotusLanternItem {
  const angle = ((seq * 1.6180339) % 1) * Math.PI * 2;
  const startOffsetR = 0.75;
  const originX = nearPosition[0] + Math.cos(angle) * startOffsetR;
  const originZ = nearPosition[1] + Math.sin(angle) * startOffsetR;

  // Gentle outward radial current away from central island
  const dx = originX - ISLAND_CENTER_X;
  const dz = originZ - ISLAND_CENTER_Z;
  const len = Math.hypot(dx, dz) || 1;
  const speed = 0.14;

  return {
    id: `lotus-lantern-${seq}-${Math.round(nowSec * 100)}`,
    originX,
    originZ,
    driftVx: (dx / len) * speed,
    driftVz: (dz / len) * speed,
    spawnedAtSec: nowSec,
    phase: seq * 1.37,
    petalColor: LOTUS_PETAL_PALETTE[seq % LOTUS_PETAL_PALETTE.length]!,
  };
}

function createSkyGradientTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#050811');
  grad.addColorStop(0.32, '#070c1a');
  grad.addColorStop(0.52, '#0d1528');
  grad.addColorStop(0.68, '#111d36');
  grad.addColorStop(1.0, '#060913');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createFullMoonSurfaceTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Warm pearl-ivory lunar base
  const baseGrad = ctx.createLinearGradient(0, 0, 0, 256);
  baseGrad.addColorStop(0, '#fffef7');
  baseGrad.addColorStop(0.5, '#fef9e7');
  baseGrad.addColorStop(1, '#e2e8f0');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 512, 256);

  // Subtle lunar maria patches for authentic full-moon depth
  const mariaPatches: Array<[number, number, number, number]> = [
    [190, 96, 54, 0.16],
    [250, 118, 66, 0.18],
    [312, 88, 44, 0.14],
    [152, 146, 48, 0.13],
    [356, 148, 52, 0.15],
    [232, 168, 38, 0.11],
  ];

  for (const [cx, cy, r, alpha] of mariaPatches) {
    const mGrad = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
    mGrad.addColorStop(0, `rgba(148, 163, 184, ${alpha})`);
    mGrad.addColorStop(0.65, `rgba(186, 198, 216, ${alpha * 0.55})`);
    mGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = mGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createRadialGlowTexture(
  innerRgba: string,
  midRgba: string,
  outerRgba = 'rgba(6, 9, 19, 0)',
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createRadialGradient(128, 128, 6, 128, 128, 126);
  grad.addColorStop(0, innerRgba);
  grad.addColorStop(0.36, midRgba);
  grad.addColorStop(1, outerRgba);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createWaterRippleNormalTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const img = ctx.createImageData(size, size);
  const data = img.data;
  const tau = Math.PI * 2;

  // Seamless periodic wave derivatives packed into RGB tangent-space normal map
  for (let y = 0; y < size; y++) {
    const v = (y / size) * tau;
    for (let x = 0; x < size; x++) {
      const u = (x / size) * tau;
      const dx =
        Math.cos(u * 3 + v * 2) * 0.35 +
        Math.cos(u * 7 - v * 4) * 0.22 +
        Math.sin(u * 5 + v * 6) * 0.16;
      const dy =
        Math.cos(v * 4 - u * 2) * 0.35 +
        Math.sin(v * 8 + u * 3) * 0.22 +
        Math.cos(v * 6 + u * 5) * 0.16;

      const nx = THREE.MathUtils.clamp(dx * 0.24, -1, 1);
      const ny = THREE.MathUtils.clamp(dy * 0.24, -1, 1);
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));

      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30);
  tex.needsUpdate = true;
  return tex;
}

function NightSkyAndLuminousMoon(): ReactElement {
  const skyTexture = useMemo(() => createSkyGradientTexture(), []);
  const moonSurfaceTexture = useMemo(() => createFullMoonSurfaceTexture(), []);
  const warmCoronaTexture = useMemo(
    () =>
      createRadialGlowTexture(
        'rgba(254, 249, 195, 0.72)',
        'rgba(186, 230, 253, 0.24)',
        'rgba(6, 9, 19, 0)',
      ),
    [],
  );
  const outerHaloTexture = useMemo(
    () =>
      createRadialGlowTexture(
        'rgba(125, 211, 252, 0.28)',
        'rgba(56, 189, 248, 0.09)',
        'rgba(6, 9, 19, 0)',
      ),
    [],
  );
  const shimmerPathTexture = useMemo(
    () =>
      createRadialGlowTexture(
        'rgba(254, 249, 195, 0.42)',
        'rgba(186, 230, 253, 0.14)',
        'rgba(6, 9, 19, 0)',
      ),
    [],
  );

  const coronaRef = useRef<THREE.Mesh>(null);
  const shimmerRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (coronaRef.current) {
      const pulse = 1 + Math.sin(t * 0.75) * 0.035;
      coronaRef.current.scale.set(pulse, pulse, 1);
    }
    if (shimmerRef.current) {
      const mat = shimmerRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.26 + Math.sin(t * 1.35) * 0.04;
    }
  });

  return (
    <group name="wolin-night-sky" userData={{ ignoreAdOcclusion: true }}>
      {/* Deep Indigo-Obsidian Sky Dome */}
      <mesh userData={{ ignoreAdOcclusion: true }}>
        <sphereGeometry args={[148, 32, 24]} />
        {skyTexture ? (
          <meshBasicMaterial
            map={skyTexture}
            side={THREE.BackSide}
            fog={false}
            depthWrite={false}
            toneMapped={false}
          />
        ) : (
          <meshBasicMaterial color="#070c19" side={THREE.BackSide} fog={false} depthWrite={false} />
        )}
      </mesh>

      {/* Celestial Starfield */}
      <Stars radius={102} depth={40} count={2600} factor={3.8} saturation={0.18} fade speed={0.42} />

      {/* Giant Luminous Full Moon (보름달) */}
      <group position={[0, 13.6, -48]} userData={{ ignoreAdOcclusion: true }}>
        {/* Outer Sapphire-Silver Atmospheric Corona */}
        {outerHaloTexture && (
          <mesh position={[0, 0, -1.2]} userData={{ ignoreAdOcclusion: true }}>
            <planeGeometry args={[42, 42]} />
            <meshBasicMaterial
              map={outerHaloTexture}
              transparent
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              fog={false}
              toneMapped={false}
            />
          </mesh>
        )}

        {/* Inner Warm Pearl Halo */}
        {warmCoronaTexture && (
          <mesh ref={coronaRef} position={[0, 0, -0.6]} userData={{ ignoreAdOcclusion: true }}>
            <planeGeometry args={[23, 23]} />
            <meshBasicMaterial
              map={warmCoronaTexture}
              transparent
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              fog={false}
              toneMapped={false}
            />
          </mesh>
        )}

        {/* Full Moon Sphere */}
        <mesh rotation={[0, -Math.PI * 0.35, 0]} userData={{ ignoreAdOcclusion: true }}>
          <sphereGeometry args={[5.4, 48, 36]} />
          {moonSurfaceTexture ? (
            <meshBasicMaterial map={moonSurfaceTexture} fog={false} toneMapped={false} />
          ) : (
            <meshBasicMaterial color="#fef9e7" fog={false} toneMapped={false} />
          )}
        </mesh>
      </group>

      {/* Shimmering Moonlight Path on the Salt Lake (月印千江) */}
      {shimmerPathTexture && (
        <mesh
          ref={shimmerRef}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.014, -22]}
          scale={[0.42, 2.35, 1]}
          userData={{ ignoreAdOcclusion: true }}
        >
          <planeGeometry args={[20, 26]} />
          <meshBasicMaterial
            map={shimmerPathTexture}
            transparent
            opacity={0.28}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}

interface BranchCurveSpec {
  points: Array<[number, number, number]>;
  radius: number;
}

const BODHI_TRUNK_AND_BRANCH_SPECS: readonly BranchCurveSpec[] = [
  // Sculptural S-curved primary trunk segments
  {
    points: [
      [0, 0.35, 0],
      [-0.12, 1.35, 0.08],
      [0.14, 2.45, -0.06],
      [0.02, 3.55, 0.02],
    ],
    radius: 0.28,
  },
  // Root buttresses hugging the moss mound
  {
    points: [
      [-0.95, 0.38, 0.55],
      [-0.48, 0.62, 0.28],
      [-0.08, 1.15, 0.06],
    ],
    radius: 0.14,
  },
  {
    points: [
      [0.98, 0.38, 0.48],
      [0.52, 0.64, 0.24],
      [0.1, 1.18, 0.04],
    ],
    radius: 0.13,
  },
  {
    points: [
      [-0.65, 0.4, -0.88],
      [-0.32, 0.66, -0.42],
      [-0.05, 1.15, -0.05],
    ],
    radius: 0.13,
  },
  {
    points: [
      [0.72, 0.4, -0.82],
      [0.36, 0.68, -0.38],
      [0.06, 1.2, -0.06],
    ],
    radius: 0.12,
  },
  // Sweeping primary Bodhi canopy boughs
  {
    points: [
      [-0.04, 2.35, 0.02],
      [-0.95, 3.05, 0.45],
      [-1.95, 3.65, 0.78],
      [-2.55, 3.92, 0.92],
    ],
    radius: 0.13,
  },
  {
    points: [
      [0.08, 2.45, -0.02],
      [1.02, 3.12, 0.38],
      [2.05, 3.72, 0.68],
      [2.62, 4.02, 0.82],
    ],
    radius: 0.13,
  },
  {
    points: [
      [-0.02, 2.65, -0.04],
      [-0.88, 3.38, -0.75],
      [-1.82, 3.98, -1.42],
      [-2.35, 4.22, -1.75],
    ],
    radius: 0.12,
  },
  {
    points: [
      [0.08, 2.72, -0.05],
      [0.92, 3.42, -0.72],
      [1.85, 4.05, -1.35],
      [2.38, 4.28, -1.68],
    ],
    radius: 0.12,
  },
  {
    points: [
      [0.02, 3.15, 0.04],
      [0.12, 3.95, 0.95],
      [0.18, 4.38, 1.72],
    ],
    radius: 0.1,
  },
  {
    points: [
      [0.02, 3.25, -0.04],
      [-0.1, 4.08, -0.92],
      [-0.16, 4.55, -1.65],
    ],
    radius: 0.1,
  },
  {
    points: [
      [0.02, 3.4, 0],
      [-0.35, 4.35, 0.12],
      [0.08, 5.05, -0.05],
    ],
    radius: 0.11,
  },
];

interface CanopyClusterSpec {
  pos: [number, number, number];
  scale: [number, number, number];
  color: string;
  emissive: string;
}

const BODHI_CANOPY_CLUSTERS: readonly CanopyClusterSpec[] = [
  // Central upper crown catching silver moonlight
  { pos: [0, 5.15, -0.05], scale: [1.65, 0.92, 1.55], color: '#0f766e', emissive: '#2dd4bf' },
  { pos: [-0.85, 4.82, 0.35], scale: [1.35, 0.82, 1.28], color: '#115e59', emissive: '#14b8a6' },
  { pos: [0.92, 4.86, 0.28], scale: [1.38, 0.84, 1.32], color: '#0d9488', emissive: '#2dd4bf' },
  { pos: [0.05, 4.78, -1.15], scale: [1.42, 0.8, 1.35], color: '#0f766e', emissive: '#14b8a6' },
  { pos: [0.12, 4.62, 1.35], scale: [1.28, 0.75, 1.22], color: '#115e59', emissive: '#14b8a6' },
  // Wide lateral emerald-jade bough clouds
  { pos: [-2.35, 4.05, 0.85], scale: [1.45, 0.72, 1.32], color: '#065f46', emissive: '#0d9488' },
  { pos: [-1.65, 4.35, 0.62], scale: [1.25, 0.74, 1.18], color: '#047857', emissive: '#14b8a6' },
  { pos: [2.42, 4.12, 0.78], scale: [1.48, 0.74, 1.34], color: '#065f46', emissive: '#0d9488' },
  { pos: [1.72, 4.42, 0.55], scale: [1.26, 0.72, 1.2], color: '#0f766e', emissive: '#14b8a6' },
  { pos: [-2.18, 4.32, -1.55], scale: [1.42, 0.76, 1.32], color: '#064e3b', emissive: '#0f766e' },
  { pos: [2.22, 4.36, -1.48], scale: [1.44, 0.76, 1.32], color: '#065f46', emissive: '#0d9488' },
  { pos: [-1.35, 4.52, -0.95], scale: [1.28, 0.76, 1.24], color: '#115e59', emissive: '#14b8a6' },
  { pos: [1.38, 4.56, -0.92], scale: [1.28, 0.76, 1.24], color: '#0f766e', emissive: '#2dd4bf' },
  // Lower cascading foliage tiers
  { pos: [-2.85, 3.72, 0.15], scale: [1.12, 0.58, 1.08], color: '#064e3b', emissive: '#065f46' },
  { pos: [2.88, 3.78, 0.08], scale: [1.14, 0.58, 1.08], color: '#064e3b', emissive: '#065f46' },
  { pos: [0.18, 4.22, 2.02], scale: [1.15, 0.62, 1.05], color: '#065f46', emissive: '#0d9488' },
  { pos: [-0.15, 4.35, -2.05], scale: [1.22, 0.66, 1.12], color: '#064e3b', emissive: '#0f766e' },
];

const BODHI_PARTICLE_COUNT = 64;

function BodhiLeavesAndFireflies(): ReactElement {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const particles = useMemo(() => {
    return Array.from({ length: BODHI_PARTICLE_COUNT }, (_, i) => {
      const isFirefly = i % 3 === 0;
      const radius = isFirefly
        ? 1.8 + ((i * 0.618) % 1) * 5.8
        : 0.7 + ((i * 0.37) % 1) * 3.1;
      const angle = i * 2.39996;
      return {
        isFirefly,
        baseRadius: radius,
        baseAngle: angle,
        baseY: isFirefly ? 0.45 + (i % 7) * 0.52 : 1.2 + (i % 9) * 0.42,
        fallSpeed: isFirefly ? 0.18 + (i % 5) * 0.04 : 0.28 + (i % 6) * 0.05,
        swirlSpeed: (i % 2 === 0 ? 1 : -1) * (0.14 + (i % 4) * 0.04),
        scale: isFirefly ? 0.042 : 0.068,
        color: isFirefly
          ? i % 2 === 0
            ? '#fde047'
            : '#5eead4'
          : i % 2 === 0
            ? '#fbbf24'
            : '#fde68a',
      };
    });
  }, []);

  useEffect(() => {
    const inst = meshRef.current;
    if (!inst) return;
    const c = new THREE.Color();
    particles.forEach((p, idx) => {
      c.set(p.color);
      inst.setColorAt(idx, c);
    });
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }, [particles]);

  useFrame(({ clock }) => {
    const inst = meshRef.current;
    if (!inst) return;
    const t = clock.getElapsedTime();

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]!;
      const ang = p.baseAngle + t * p.swirlSpeed;
      const sway = Math.sin(t * 1.4 + i) * 0.26;
      const r = p.baseRadius + sway;
      const x = Math.cos(ang) * r;
      const z = ISLAND_CENTER_Z + Math.sin(ang) * r;

      let y: number;
      if (p.isFirefly) {
        y = p.baseY + Math.sin(t * 1.2 + i * 0.7) * 0.45;
      } else {
        const span = 4.2;
        y = 4.5 - (((t * p.fallSpeed + p.baseY) % span + span) % span);
      }

      dummy.position.set(x, Math.max(0.14, y), z);
      dummy.rotation.set(
        t * 0.9 + i,
        t * 1.1 + i * 0.5,
        Math.sin(t + i) * 0.6,
      );
      const pulse = p.isFirefly ? 0.72 + Math.sin(t * 3.1 + i) * 0.35 : 1;
      dummy.scale.set(p.scale * pulse, p.scale * 1.35 * pulse, p.scale * 0.35);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, BODHI_PARTICLE_COUNT]}
      userData={{ ignoreAdOcclusion: true }}
    >
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function BodhiSanctuaryIsland(): ReactElement {
  const canopyRef = useRef<THREE.Group>(null);
  const lanternCoreRef = useRef<THREE.Mesh>(null);

  const branchGeometries = useMemo(() => {
    return BODHI_TRUNK_AND_BRANCH_SPECS.map((spec) => {
      const curve = new THREE.CatmullRomCurve3(
        spec.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      );
      return new THREE.TubeGeometry(curve, 20, spec.radius, 8, false);
    });
  }, []);

  useEffect(() => {
    return () => {
      for (const geo of branchGeometries) {
        geo.dispose();
      }
    };
  }, [branchGeometries]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (canopyRef.current) {
      canopyRef.current.rotation.z = Math.sin(t * 0.65) * 0.012;
      canopyRef.current.rotation.x = Math.cos(t * 0.5) * 0.009;
    }
    if (lanternCoreRef.current) {
      const mat = lanternCoreRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 2.5 + Math.sin(t * 3.4) * 0.35;
    }
  });

  return (
    <group position={[ISLAND_CENTER_X, 0, ISLAND_CENTER_Z]} name="wolin-sanctuary-island">
      {/* Tier 0: Shallow Salt-Rim & Zen Raked Sand Terrace */}
      <mesh position={[0, 0.04, 0]} receiveShadow userData={{ ignoreAdOcclusion: true }}>
        <cylinderGeometry args={[3.45, 3.85, 0.1, 48]} />
        <meshStandardMaterial color="#1e293b" roughness={0.78} metalness={0.18} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.095, 0]}
        userData={{ ignoreAdOcclusion: true }}
      >
        <ringGeometry args={[2.92, 3.28, 48]} />
        <meshStandardMaterial color="#334155" roughness={0.85} />
      </mesh>

      {/* Tier 1: Sculpted Basalt Sanctuary Stone Terrace */}
      <mesh position={[0, 0.19, 0]} receiveShadow castShadow userData={{ ignoreAdOcclusion: true }}>
        <cylinderGeometry args={[2.68, 3.05, 0.24, 14]} />
        <meshStandardMaterial color="#192335" roughness={0.72} metalness={0.22} flatShading />
      </mesh>

      {/* Tier 2: Lush Mossy Bodhi Root Mound */}
      <mesh position={[0, 0.42, -0.1]} receiveShadow castShadow userData={{ ignoreAdOcclusion: true }}>
        <cylinderGeometry args={[1.65, 2.25, 0.32, 12]} />
        <meshStandardMaterial color="#0b3b32" roughness={0.88} metalness={0.08} flatShading />
      </mesh>

      {/* Moss Cushions & Perimeter Sanctuary Stones */}
      {[
        { pos: [-2.15, 0.28, 1.35] as [number, number, number], s: 0.42, color: '#0f5132' },
        { pos: [2.25, 0.26, 1.18] as [number, number, number], s: 0.38, color: '#115e59' },
        { pos: [-2.35, 0.25, -1.05] as [number, number, number], s: 0.46, color: '#1e293b' },
        { pos: [2.3, 0.27, -1.25] as [number, number, number], s: 0.44, color: '#065f46' },
        { pos: [0.25, 0.3, -2.25] as [number, number, number], s: 0.5, color: '#1e293b' },
      ].map((rock, idx) => (
        <mesh
          key={idx}
          position={rock.pos}
          scale={[rock.s * 1.35, rock.s * 0.62, rock.s * 1.15]}
          castShadow
          receiveShadow
          userData={{ ignoreAdOcclusion: true }}
        >
          <dodecahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color={rock.color} roughness={0.82} flatShading />
        </mesh>
      ))}

      {/* Meditation Stone Seat (좌대 · Jwadae) */}
      <group position={[-1.18, 0.31, 1.18]} userData={{ ignoreAdOcclusion: true }}>
        {/* Carved Lotus Stone Base */}
        <mesh position={[0, 0.08, 0]} castShadow receiveShadow userData={{ ignoreAdOcclusion: true }}>
          <cylinderGeometry args={[0.62, 0.72, 0.16, 12]} />
          <meshStandardMaterial color="#334155" roughness={0.68} metalness={0.18} flatShading />
        </mesh>
        {/* Polished Slate Meditation Slab */}
        <mesh position={[0, 0.19, 0]} castShadow receiveShadow userData={{ ignoreAdOcclusion: true }}>
          <cylinderGeometry args={[0.54, 0.58, 0.07, 16]} />
          <meshStandardMaterial color="#475569" roughness={0.45} metalness={0.28} />
        </mesh>
        {/* Warm Woven Meditation Cushion */}
        <mesh position={[0, 0.25, 0]} castShadow userData={{ ignoreAdOcclusion: true }}>
          <cylinderGeometry args={[0.38, 0.42, 0.06, 20]} />
          <meshStandardMaterial color="#78350f" roughness={0.9} metalness={0.05} />
        </mesh>
      </group>

      {/* Korean Buddhist Stone Lantern (석등 · Seokdeung) */}
      <group position={[1.42, 0.31, 1.02]} userData={{ ignoreAdOcclusion: true }}>
        {/* Octagonal Lower Pedestal (하대석) */}
        <mesh position={[0, 0.1, 0]} castShadow receiveShadow userData={{ ignoreAdOcclusion: true }}>
          <cylinderGeometry args={[0.28, 0.36, 0.2, 8]} />
          <meshStandardMaterial color="#475569" roughness={0.7} flatShading />
        </mesh>
        {/* Slender Octagonal Pillar (간주석) */}
        <mesh position={[0, 0.46, 0]} castShadow userData={{ ignoreAdOcclusion: true }}>
          <cylinderGeometry args={[0.1, 0.12, 0.54, 8]} />
          <meshStandardMaterial color="#64748b" roughness={0.68} flatShading />
        </mesh>
        {/* Upper Lotus Table (상대석) */}
        <mesh position={[0, 0.76, 0]} castShadow userData={{ ignoreAdOcclusion: true }}>
          <cylinderGeometry args={[0.28, 0.18, 0.1, 8]} />
          <meshStandardMaterial color="#475569" roughness={0.65} flatShading />
        </mesh>
        {/* Glowing Warm Flame Chamber (화사석) */}
        <mesh ref={lanternCoreRef} position={[0, 0.96, 0]} userData={{ ignoreAdOcclusion: true }}>
          <cylinderGeometry args={[0.17, 0.17, 0.28, 8]} />
          <meshStandardMaterial
            color="#fef08a"
            emissive="#f59e0b"
            emissiveIntensity={2.6}
            roughness={0.2}
            toneMapped={false}
          />
        </mesh>
        {/* Overhanging Pagoda Roof (옥개석) */}
        <mesh position={[0, 1.19, 0]} castShadow userData={{ ignoreAdOcclusion: true }}>
          <coneGeometry args={[0.42, 0.24, 8]} />
          <meshStandardMaterial color="#334155" roughness={0.62} flatShading />
        </mesh>
        {/* Lotus Finial Jewel (보주) */}
        <mesh position={[0, 1.36, 0]} userData={{ ignoreAdOcclusion: true }}>
          <sphereGeometry args={[0.065, 12, 12]} />
          <meshStandardMaterial
            color="#fde68a"
            emissive="#fbbf24"
            emissiveIntensity={1.1}
          />
        </mesh>
        {/* Warm Sanctuary Lantern Light */}
        <pointLight
          position={[0, 0.98, 0]}
          color="#fbbf24"
          intensity={2.45}
          distance={10}
          decay={1.7}
        />
      </group>

      {/* Multi-Branched Sculptural Bodhi Tree (보리수 나무) */}
      <group position={[0, 0.22, -0.15]} userData={{ ignoreAdOcclusion: true }}>
        {branchGeometries.map((geo, idx) => (
          <mesh
            key={idx}
            geometry={geo}
            castShadow
            receiveShadow
            userData={{ ignoreAdOcclusion: true }}
          >
            <meshStandardMaterial
              color="#3d312a"
              roughness={0.82}
              metalness={0.12}
            />
          </mesh>
        ))}

        {/* Lush Layered Emerald-Teal Canopy Catching Silver Moonlight */}
        <group ref={canopyRef} userData={{ ignoreAdOcclusion: true }}>
          {BODHI_CANOPY_CLUSTERS.map((cluster, idx) => (
            <mesh
              key={idx}
              position={cluster.pos}
              scale={cluster.scale}
              castShadow
              receiveShadow
              userData={{ ignoreAdOcclusion: true }}
            >
              <icosahedronGeometry args={[1, 2]} />
              <meshStandardMaterial
                color={cluster.color}
                emissive={cluster.emissive}
                emissiveIntensity={0.2}
                roughness={0.62}
                metalness={0.14}
                flatShading
              />
            </mesh>
          ))}

          {/* Delicate Hanging Aerial Vines Catching Moonlight */}
          {[
            [-1.75, 3.25, 0.65, 1.15],
            [1.82, 3.3, 0.58, 1.1],
            [-1.55, 3.4, -1.1, 1.2],
            [1.62, 3.45, -1.05, 1.15],
            [0.15, 3.55, 1.55, 0.95],
          ].map(([vx, vy, vz, vh], i) => (
            <mesh
              key={i}
              position={[vx!, vy!, vz!]}
              userData={{ ignoreAdOcclusion: true }}
            >
              <cylinderGeometry args={[0.008, 0.004, vh!, 5]} />
              <meshBasicMaterial
                color="#5eead4"
                transparent
                opacity={0.38}
              />
            </mesh>
          ))}
        </group>

        {/* Subtle Canopy Emerald Fill & Silver Lunar Crown Rim Light */}
        <pointLight position={[0, 3.1, 0.5]} color="#2dd4bf" intensity={1.15} distance={7.5} />
        <pointLight position={[0, 5.8, -0.8]} color="#bae6fd" intensity={1.55} distance={10} />
      </group>
    </group>
  );
}

interface SingleLotusLanternMeshProps {
  item: LotusLanternItem;
}

const PETAL_ANGLES = [0, 0.785, 1.57, 2.356, 3.141, 3.927, 4.712, 5.497] as const;

function SingleLotusLanternMesh({ item }: SingleLotusLanternMeshProps): ReactElement {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const now = clock.getElapsedTime();
    const age = Math.max(0, now - item.spawnedAtSec);

    let x = item.originX + item.driftVx * age + Math.sin(now * 0.45 + item.phase) * 0.16;
    let z = item.originZ + item.driftVz * age + Math.cos(now * 0.38 + item.phase) * 0.16;

    // Soft wrap within outer calm lake perimeter so lanterns drift endlessly
    const r = Math.hypot(x, z);
    if (r > 22) {
      const wrapScale = 5.5 / r;
      x *= wrapScale;
      z *= wrapScale;
    }

    // Keep outside island stone edge
    const dx = x - ISLAND_CENTER_X;
    const dz = z - ISLAND_CENTER_Z;
    const dIsland = Math.hypot(dx, dz);
    if (dIsland < ISLAND_COLLISION_RADIUS + 0.45 && dIsland > 0.001) {
      const push = (ISLAND_COLLISION_RADIUS + 0.45) / dIsland;
      x = ISLAND_CENTER_X + dx * push;
      z = ISLAND_CENTER_Z + dz * push;
    }

    const bobY = 0.045 + Math.sin(now * 1.9 + item.phase) * 0.016;
    groupRef.current.position.set(x, bobY, z);
    groupRef.current.rotation.y = now * 0.22 + item.phase;
  });

  return (
    <group
      ref={groupRef}
      position={[item.originX, 0.05, item.originZ]}
      userData={{ ignoreAdOcclusion: true }}
    >
      {/* Water Surface Warm Halo */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} userData={{ ignoreAdOcclusion: true }}>
        <circleGeometry args={[0.42, 24]} />
        <meshBasicMaterial
          color="#fbbf24"
          transparent
          opacity={0.32}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Deep Green Lotus Leaf Pad */}
      <mesh position={[0, 0, 0]} userData={{ ignoreAdOcclusion: true }}>
        <cylinderGeometry args={[0.22, 0.18, 0.025, 16]} />
        <meshStandardMaterial color="#065f46" roughness={0.7} />
      </mesh>

      {/* Crown of 8 Lotus Petals */}
      {PETAL_ANGLES.map((ang) => (
        <mesh
          key={ang}
          position={[Math.cos(ang) * 0.13, 0.075, Math.sin(ang) * 0.13]}
          rotation={[Math.sin(ang) * 0.42, -ang, -Math.cos(ang) * 0.42]}
          userData={{ ignoreAdOcclusion: true }}
        >
          <coneGeometry args={[0.068, 0.17, 5]} />
          <meshStandardMaterial
            color={item.petalColor}
            emissive="#f59e0b"
            emissiveIntensity={0.65}
            roughness={0.35}
          />
        </mesh>
      ))}

      {/* Glowing Golden Candle Heart */}
      <mesh position={[0, 0.09, 0]} userData={{ ignoreAdOcclusion: true }}>
        <sphereGeometry args={[0.075, 12, 12]} />
        <meshBasicMaterial color="#fef9c3" toneMapped={false} />
      </mesh>
    </group>
  );
}

interface MirrorSaltLakeProps {
  onLakeTargetClick: (xz: [number, number]) => void;
}

function MirrorSaltLake({ onLakeTargetClick }: MirrorSaltLakeProps): ReactElement {
  const rippleNormalMap = useMemo(() => createWaterRippleNormalTexture(), []);
  const pointerDownScreenRef = useRef<{ x: number; y: number } | null>(null);
  const normalScaleVec = useMemo(() => new THREE.Vector2(0.11, 0.11), []);

  useEffect(() => {
    return () => {
      rippleNormalMap?.dispose();
    };
  }, [rippleNormalMap]);

  useFrame((_, delta) => {
    if (rippleNormalMap) {
      rippleNormalMap.offset.x = (rippleNormalMap.offset.x + delta * 0.011) % 1;
      rippleNormalMap.offset.y = (rippleNormalMap.offset.y + delta * 0.016) % 1;
    }
  });

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    pointerDownScreenRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      const start = pointerDownScreenRef.current;
      if (start) {
        const dragDist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
        if (dragDist > 6) return;
      }
      e.stopPropagation();
      onLakeTargetClick([e.point.x, e.point.z]);
    },
    [onLakeTargetClick],
  );

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      receiveShadow
      userData={{ ignoreAdOcclusion: true }}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <circleGeometry args={[86, 96]} />
      <MeshReflectorMaterial
        mirror={0.85}
        blur={[240, 80]}
        resolution={512}
        mixBlur={0.32}
        mixStrength={1.65}
        roughness={0.22}
        metalness={0.42}
        color="#091224"
        depthScale={0.3}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.25}
        normalMap={rippleNormalMap ?? undefined}
        normalScale={normalScaleVec}
      />
    </mesh>
  );
}

interface SanctuaryExplorerRigProps {
  portals: readonly SanctuaryPortal[];
  walkTarget: [number, number] | null;
  onAvatarPositionUpdate: (xz: [number, number]) => void;
  onStepPortal: (portal: SanctuaryPortal) => void;
}

function clampOutsideIsland(x: number, z: number): [number, number] {
  let nx = x;
  let nz = z;

  const rFromOrigin = Math.hypot(nx, nz);
  if (rFromOrigin > LAKE_WALK_MAX_RADIUS) {
    const scale = LAKE_WALK_MAX_RADIUS / rFromOrigin;
    nx *= scale;
    nz *= scale;
  }

  const dx = nx - ISLAND_CENTER_X;
  const dz = nz - ISLAND_CENTER_Z;
  const distToIsland = Math.hypot(dx, dz);
  if (distToIsland < ISLAND_COLLISION_RADIUS) {
    const safeX = distToIsland > 0.001 ? dx / distToIsland : 0;
    const safeZ = distToIsland > 0.001 ? dz / distToIsland : 1;
    nx = ISLAND_CENTER_X + safeX * ISLAND_COLLISION_RADIUS;
    nz = ISLAND_CENTER_Z + safeZ * ISLAND_COLLISION_RADIUS;
  }

  return [nx, nz];
}

function SanctuaryExplorerRig({
  portals,
  walkTarget,
  onAvatarPositionUpdate,
  onStepPortal,
}: SanctuaryExplorerRigProps): ReactElement {
  const avatarGroupRef = useRef<THREE.Group>(null);
  const waterRingRef = useRef<THREE.Mesh>(null);
  const targetMarkerRef = useRef<THREE.Mesh>(null);
  const posRef = useRef<[number, number]>([1.05, 4.85]);
  const activeGoalRef = useRef<[number, number] | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const insidePortalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (walkTarget) {
      activeGoalRef.current = clampOutsideIsland(walkTarget[0], walkTarget[1]);
    }
  }, [walkTarget]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isTypingElement = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingElement(e.target)) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        keysRef.current.add(k);
        activeGoalRef.current = null;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    const onBlur = () => {
      keysRef.current.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1);
    const keys = keysRef.current;
    let moveX = 0;
    let moveZ = 0;

    if (keys.has('w') || keys.has('arrowup')) moveZ -= 1;
    if (keys.has('s') || keys.has('arrowdown')) moveZ += 1;
    if (keys.has('a') || keys.has('arrowleft')) moveX -= 1;
    if (keys.has('d') || keys.has('arrowright')) moveX += 1;

    const speed = 3.8;
    let [cx, cz] = posRef.current;
    let moved = false;

    if (moveX !== 0 || moveZ !== 0) {
      const len = Math.hypot(moveX, moveZ);
      const vx = (moveX / len) * speed * dt;
      const vz = (moveZ / len) * speed * dt;
      [cx, cz] = clampOutsideIsland(cx + vx, cz + vz);
      moved = true;
      if (avatarGroupRef.current) {
        const targetYaw = Math.atan2(vx, vz);
        avatarGroupRef.current.rotation.y = THREE.MathUtils.lerp(
          avatarGroupRef.current.rotation.y,
          targetYaw,
          0.18,
        );
      }
    } else if (activeGoalRef.current) {
      const [gx, gz] = activeGoalRef.current;
      const dx = gx - cx;
      const dz = gz - cz;
      const dist = Math.hypot(dx, dz);
      if (dist <= 0.12) {
        cx = gx;
        cz = gz;
        activeGoalRef.current = null;
      } else {
        const step = Math.min(dist, speed * dt);
        const vx = (dx / dist) * step;
        const vz = (dz / dist) * step;
        [cx, cz] = clampOutsideIsland(cx + vx, cz + vz);
        moved = true;
        if (avatarGroupRef.current) {
          const targetYaw = Math.atan2(vx, vz);
          avatarGroupRef.current.rotation.y = THREE.MathUtils.lerp(
            avatarGroupRef.current.rotation.y,
            targetYaw,
            0.18,
          );
        }
      }
    }

    if (moved) {
      posRef.current = [cx, cz];
      onAvatarPositionUpdate([cx, cz]);
    }

    if (avatarGroupRef.current) {
      avatarGroupRef.current.position.set(cx, 0.02, cz);
    }

    if (waterRingRef.current) {
      const ripple = 1 + Math.sin(clock.getElapsedTime() * (moved ? 6.5 : 2.2)) * 0.12;
      waterRingRef.current.position.set(cx, 0.024, cz);
      waterRingRef.current.scale.set(ripple, ripple, 1);
    }

    if (targetMarkerRef.current) {
      if (activeGoalRef.current) {
        targetMarkerRef.current.visible = true;
        targetMarkerRef.current.position.set(activeGoalRef.current[0], 0.03, activeGoalRef.current[1]);
        const s = 0.75 + ((clock.getElapsedTime() * 1.4) % 0.65);
        targetMarkerRef.current.scale.set(s, s, 1);
      } else {
        targetMarkerRef.current.visible = false;
      }
    }

    // Proximity portal check with hysteresis so "Stay" does not re-open while standing inside
    let nearestPortal: SanctuaryPortal | null = null;
    let nearestDist = Infinity;
    for (const p of portals) {
      const d = Math.hypot(cx - p.position[0], cz - p.position[2]);
      if (d < nearestDist) {
        nearestDist = d;
        nearestPortal = p;
      }
    }

    if (insidePortalIdRef.current) {
      const prevPortal = portals.find((p) => p.id === insidePortalIdRef.current);
      const distToPrev = prevPortal
        ? Math.hypot(cx - prevPortal.position[0], cz - prevPortal.position[2])
        : Infinity;
      if (distToPrev > 1.75) {
        insidePortalIdRef.current = null;
      }
    } else if (nearestPortal && nearestDist < 1.2) {
      insidePortalIdRef.current = nearestPortal.id;
      onStepPortal(nearestPortal);
    }
  });

  return (
    <group name="wolin-explorer-controller">
      {/* Shallow Water Footstep Ripple Ring */}
      <mesh
        ref={waterRingRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[1.05, 0.024, 4.85]}
        userData={{ ignoreAdOcclusion: true }}
      >
        <ringGeometry args={[0.52, 0.64, 36]} />
        <meshBasicMaterial
          color="#7dd3fc"
          transparent
          opacity={0.42}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Lake Click Destination Ripple */}
      <mesh
        ref={targetMarkerRef}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[1.05, 0.03, 4.85]}
        userData={{ ignoreAdOcclusion: true }}
      >
        <ringGeometry args={[0.32, 0.44, 32]} />
        <meshBasicMaterial
          color="#fde68a"
          transparent
          opacity={0.72}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Lego Block #1: Sovereign Wolin Identity & 3D Avatar */}
      <group
        ref={avatarGroupRef}
        position={[1.05, 0.02, 4.85]}
        rotation={[0, Math.PI * 0.9, 0]}
      >
        <WolinAuthAndAvatar />
      </group>
    </group>
  );
}

interface SanctuaryCameraRigProps {
  cameraMode: SanctuaryCameraMode;
  modeTriggerNonce: number;
}

function SanctuaryCameraRig({
  cameraMode,
  modeTriggerNonce,
}: SanctuaryCameraRigProps): ReactElement {
  const { camera, size } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const transitionRemainingRef = useRef<number>(1.1);
  const desiredPos = useMemo(() => new THREE.Vector3(), []);
  const desiredTarget = useMemo(() => new THREE.Vector3(), []);

  const isPortrait = size.width / Math.max(1, size.height) < 0.78;

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      const nextFov = isPortrait ? 57 : 47;
      if (camera.fov !== nextFov) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
      }
    }
    transitionRemainingRef.current = 1.25;
  }, [camera, cameraMode, isPortrait, modeTriggerNonce]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1);
    const controls = controlsRef.current;

    if (cameraMode === 'meditate') {
      const t = clock.getElapsedTime();
      const swayX = Math.sin(t * 0.22) * 0.55;
      const zDist = isPortrait ? 11.4 : 8.9;
      desiredPos.set(swayX, 1.72, zDist);
      desiredTarget.set(0, 3.8, -15.5);

      camera.position.lerp(desiredPos, 1 - Math.exp(-2.2 * dt));
      if (controls) {
        controls.target.lerp(desiredTarget, 1 - Math.exp(-2.2 * dt));
        controls.update();
      } else {
        camera.lookAt(desiredTarget);
      }
      return;
    }

    if (transitionRemainingRef.current > 0) {
      transitionRemainingRef.current = Math.max(0, transitionRemainingRef.current - dt);

      if (cameraMode === 'ad-focus') {
        desiredPos.set(10.8, 2.05, 7.55);
        desiredTarget.set(15.5, 1.65, 4.2);
      } else if (cameraMode === 'stage-focus') {
        desiredPos.set(-3.8, 2.55, 0.6);
        desiredTarget.set(-8.6, 2.2, -5.2);
      } else if (isPortrait) {
        desiredPos.set(0, 3.85, 17.6);
        desiredTarget.set(0, 2.1, -2.4);
      } else {
        desiredPos.set(0, 3.15, 13.4);
        desiredTarget.set(0, 2.05, -2.4);
      }

      const alpha = 1 - Math.exp(-3.4 * dt);
      camera.position.lerp(desiredPos, alpha);
      if (controls) {
        controls.target.lerp(desiredTarget, alpha);
        controls.update();
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      minDistance={3.2}
      maxDistance={26}
      maxPolarAngle={Math.PI / 2 - 0.035}
      minPolarAngle={0.22}
      rotateSpeed={0.68}
    />
  );
}

export interface WolinSanctuaryProps {
  portals: readonly SanctuaryPortal[];
  selectedPortalId: string | null;
  portalPulseMap: Readonly<Record<string, number>>;
  lanterns: readonly LotusLanternItem[];
  cameraMode: SanctuaryCameraMode;
  cameraModeNonce: number;
  walkTarget: [number, number] | null;
  onLakeWalkTarget: (xz: [number, number]) => void;
  onAvatarPositionChange: (xz: [number, number]) => void;
  onSelectPortal: (portal: SanctuaryPortal) => void;
  children?: ReactNode;
}

export function WolinSanctuary({
  portals,
  selectedPortalId,
  portalPulseMap,
  lanterns,
  cameraMode,
  cameraModeNonce,
  walkTarget,
  onLakeWalkTarget,
  onAvatarPositionChange,
  onSelectPortal,
  children,
}: WolinSanctuaryProps): ReactElement {
  return (
    <>
      <color attach="background" args={['#060913']} />
      <fogExp2 attach="fog" args={['#070c1a', 0.0115]} />

      {/* Contemplative Lunar Lighting */}
      <hemisphereLight args={['#93c5fd', '#091122', 0.62]} />
      <directionalLight
        position={[0, 18, -38]}
        intensity={1.95}
        color="#dbeafe"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={4}
        shadow-camera-far={72}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <directionalLight position={[6, 8, 12]} intensity={0.45} color="#93c5fd" />

      {/* Night Sky, Stars, Giant Luminous Full Moon & Shimmering Water Path */}
      <NightSkyAndLuminousMoon />

      {/* Real-Time Mirror Salt Lake (MeshReflectorMaterial) */}
      <MirrorSaltLake onLakeTargetClick={onLakeWalkTarget} />

      {/* Central Moss/Stone Sanctuary Island, Meditation Stone Seat, Stone Lantern & Bodhi Tree */}
      <BodhiSanctuaryIsland />

      {/* Drifting Golden Bodhi Leaves & Luminous Fireflies */}
      <BodhiLeavesAndFireflies />

      {/* Moon Reflection Portals on the Salt Lake (달 그림자 포털) */}
      <MoonPortals
        portals={portals}
        selectedPortalId={selectedPortalId}
        portalPulseMap={portalPulseMap}
        onSelectPortal={onSelectPortal}
      />

      {/* Drifting Lotus Lanterns (연등 띄우기) */}
      <group name="wolin-lotus-lanterns" userData={{ ignoreAdOcclusion: true }}>
        {lanterns.map((item) => (
          <SingleLotusLanternMesh key={item.id} item={item} />
        ))}
      </group>

      {/* Walkable Explorer Avatar + Proximity Portal Detector */}
      <SanctuaryExplorerRig
        portals={portals}
        walkTarget={walkTarget}
        onAvatarPositionUpdate={onAvatarPositionChange}
        onStepPortal={onSelectPortal}
      />

      {/* Optional Sovereign Blocks (Stage Screen, Spatial AdSlot, Occluder Wall) */}
      {children}

      {/* Smooth Meditation & Sanctuary Camera Rig */}
      <SanctuaryCameraRig cameraMode={cameraMode} modeTriggerNonce={cameraModeNonce} />
    </>
  );
}
