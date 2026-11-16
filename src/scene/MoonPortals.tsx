import { useFrame } from '@react-three/fiber';
import { type ReactElement, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { sanitizeHttpAssetUrl } from '../wolin/client';

export interface SanctuaryPortal {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  description: string;
  url: string;
  position: [number, number, number];
  accentColor: string;
  glowColor: string;
  isCustomPodLink?: boolean;
}

export const CANONICAL_MOON_PORTALS: readonly SanctuaryPortal[] = [
  {
    id: 'moon-01-jarvis',
    code: 'Moon 01',
    title: 'Jarvis Sanctuary',
    subtitle: 'First Explorer · jarvis.wolin.id',
    description:
      'Step into the Sovereign Passport shrine of Jarvis — Wolin’s first pioneer explorer.',
    url: 'https://auth.wolin.id/passport/jarvis',
    position: [-2.65, 0, 2.75],
    accentColor: '#fde68a',
    glowColor: '#f59e0b',
  },
  {
    id: 'moon-02-seokgatap',
    code: 'Moon 02',
    title: 'Seokgatap Walk',
    subtitle: 'topdoli.com · Pagoda Circumambulation',
    description:
      'Walk the quiet moonlit courtyard of ancient stone pagodas in contemplative stillness.',
    url: 'https://topdoli.com/',
    position: [2.65, 0, 2.75],
    accentColor: '#bae6fd',
    glowColor: '#38bdf8',
  },
  {
    id: 'moon-03-madang',
    code: 'Moon 03',
    title: 'Campfire Madang',
    subtitle: 'meemora.co/madang · Gathering Courtyard',
    description:
      'Gather around a warm crackling courtyard fire beneath open stars and shared stories.',
    url: 'https://meemora.co/madang/',
    position: [-3.75, 0, -2.05],
    accentColor: '#fed7aa',
    glowColor: '#fb923c',
  },
  {
    id: 'moon-04-jazzbar',
    code: 'Moon 04',
    title: 'The Jazz Bar',
    subtitle: 'zzazzbar.com · Late-Night Vinyl & Brass',
    description:
      'Drift from the silent salt lake into an intimate midnight lounge of warm brass and vinyl.',
    url: 'https://zzazzbar.com/',
    position: [3.75, 0, -2.05],
    accentColor: '#ddd6fe',
    glowColor: '#a78bfa',
  },
] as const;

const DYNAMIC_PORTAL_SLOTS: ReadonlyArray<[number, number, number]> = [
  [0, 0, 6.45],
  [-6.5, 0, 0.05],
  [6.5, 0, 0.05],
  [-3.2, 0, 6.1],
  [3.2, 0, 6.1],
];

function normalizeComparableUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    const cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${cleanPath}${parsed.search}`;
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/+$/, '');
  }
}

function formatCustomPortalTitle(urlStr: string, indexOffset: number): {
  title: string;
  subtitle: string;
} {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.replace(/^www\./, '');
    const firstSeg = u.pathname.split('/').filter(Boolean)[0];
    const cleanName = firstSeg
      ? `${host.split('.')[0]} · ${firstSeg}`
      : host.replace(/\.[a-z]+$/i, '');
    const capitalized =
      cleanName.charAt(0).toUpperCase() + cleanName.slice(1).replace(/[-_]/g, ' ');
    return {
      title: capitalized || `Pod World ${indexOffset}`,
      subtitle: `${host} · Pod wolin:worldLinks`,
    };
  } catch {
    return {
      title: `Pod World ${indexOffset}`,
      subtitle: 'Custom Wolin Pod Link',
    };
  }
}

/**
 * Merge the 4 canonical Moon Reflection Portals with any custom `wolin:worldLinks`
 * discovered in the signed-in explorer's Wolin Pod profile (deduplicating canonical URLs).
 */
export function buildSanctuaryPortals(
  podWorldLinks: readonly string[] = [],
): SanctuaryPortal[] {
  const portals: SanctuaryPortal[] = [...CANONICAL_MOON_PORTALS];
  const seen = new Set<string>(
    CANONICAL_MOON_PORTALS.map((p) => normalizeComparableUrl(p.url)),
  );

  let dynamicIdx = 0;
  for (const rawLink of podWorldLinks) {
    const sanitized = sanitizeHttpAssetUrl(rawLink);
    if (!sanitized) continue;
    const key = normalizeComparableUrl(sanitized);
    if (seen.has(key)) continue;
    seen.add(key);

    const moonNumber = portals.length + 1;
    const code = `Moon ${String(moonNumber).padStart(2, '0')}`;
    const slot =
      DYNAMIC_PORTAL_SLOTS[dynamicIdx % DYNAMIC_PORTAL_SLOTS.length] ?? [
        Math.cos(dynamicIdx * 1.1) * 7.2,
        0,
        Math.sin(dynamicIdx * 1.1) * 7.2,
      ];
    const meta = formatCustomPortalTitle(sanitized, dynamicIdx + 1);

    portals.push({
      id: `moon-pod-${moonNumber}-${dynamicIdx}`,
      code,
      title: meta.title,
      subtitle: meta.subtitle,
      description: 'Personal sovereign world portal linked directly from your Wolin Pod.',
      url: sanitized,
      position: [slot[0], slot[1], slot[2]],
      accentColor: '#10B981',
      glowColor: '#059669',
      isCustomPodLink: true,
    });
    dynamicIdx += 1;
  }

  return portals;
}

function createMoonDiscTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 126);
  grad.addColorStop(0, 'rgba(255, 252, 235, 0.96)');
  grad.addColorStop(0.38, 'rgba(226, 242, 254, 0.72)');
  grad.addColorStop(0.68, 'rgba(125, 211, 252, 0.28)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

interface SingleMoonPortalNodeProps {
  portal: SanctuaryPortal;
  index: number;
  isSelected: boolean;
  pulseTimestamp: number;
  discTexture: THREE.CanvasTexture | null;
  onSelect: (portal: SanctuaryPortal) => void;
}

function SingleMoonPortalNode({
  portal,
  index,
  isSelected,
  pulseTimestamp,
  discTexture,
  onSelect,
}: SingleMoonPortalNodeProps): ReactElement {
  const outerRippleRef = useRef<THREE.Mesh>(null);
  const secondRippleRef = useRef<THREE.Mesh>(null);
  const pulseBurstRef = useRef<THREE.Mesh>(null);
  const filamentGroupRef = useRef<THREE.Group>(null);
  const coreDiscRef = useRef<THREE.Mesh>(null);

  const filamentAngles = useMemo(() => [0, 1.05, 2.1, 3.15, 4.2, 5.25], []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + index * 0.85;

    if (coreDiscRef.current) {
      const breath = 1 + Math.sin(t * 1.8) * 0.045 + (isSelected ? 0.08 : 0);
      coreDiscRef.current.scale.set(breath, breath, 1);
    }

    if (outerRippleRef.current) {
      const cycle = (t * 0.42) % 1;
      const scale = 1 + cycle * 0.85;
      outerRippleRef.current.scale.set(scale, scale, 1);
      const mat = outerRippleRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - cycle) * (isSelected ? 0.62 : 0.38);
    }

    if (secondRippleRef.current) {
      const cycle2 = ((t * 0.42) + 0.5) % 1;
      const scale2 = 1 + cycle2 * 0.85;
      secondRippleRef.current.scale.set(scale2, scale2, 1);
      const mat2 = secondRippleRef.current.material as THREE.MeshBasicMaterial;
      mat2.opacity = (1 - cycle2) * (isSelected ? 0.52 : 0.3);
    }

    if (pulseBurstRef.current) {
      const elapsedSincePulse = ( performance.now() - pulseTimestamp ) / 1000;
      if (pulseTimestamp > 0 && elapsedSincePulse >= 0 && elapsedSincePulse < 1.35) {
        const p = elapsedSincePulse / 1.35;
        const burstScale = 1 + p * 1.95;
        pulseBurstRef.current.visible = true;
        pulseBurstRef.current.scale.set(burstScale, burstScale, 1);
        const burstMat = pulseBurstRef.current.material as THREE.MeshBasicMaterial;
        burstMat.opacity = (1 - p) * 0.85;
      } else {
        pulseBurstRef.current.visible = false;
      }
    }

    if (filamentGroupRef.current) {
      filamentGroupRef.current.rotation.y = t * 0.16;
      filamentGroupRef.current.position.y = Math.sin(t * 1.4) * 0.06;
    }
  });

  return (
    <group position={portal.position} userData={{ ignoreAdOcclusion: true }}>
      {/* Soft Lunar Reflection Disc on Salt Lake Surface */}
      <mesh
        ref={coreDiscRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.028, 0]}
        userData={{ ignoreAdOcclusion: true }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(portal);
        }}
        onPointerOver={() => {
          if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          if (typeof document !== 'undefined') document.body.style.cursor = 'auto';
        }}
      >
        <circleGeometry args={[1.08, 48]} />
        {discTexture ? (
          <meshBasicMaterial
            map={discTexture}
            color={portal.accentColor}
            transparent
            opacity={isSelected ? 0.95 : 0.82}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        ) : (
          <meshBasicMaterial
            color={portal.accentColor}
            transparent
            opacity={0.68}
            depthWrite={false}
          />
        )}
      </mesh>

      {/* Crisp Inner Crescent Rim */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.032, 0]}
        userData={{ ignoreAdOcclusion: true }}
      >
        <ringGeometry args={[0.76, 0.82, 48]} />
        <meshBasicMaterial
          color="#f8fafc"
          transparent
          opacity={isSelected ? 0.92 : 0.65}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Animated Expanding Water Ripple Rings */}
      <mesh
        ref={outerRippleRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.034, 0]}
        userData={{ ignoreAdOcclusion: true }}
      >
        <ringGeometry args={[0.84, 0.9, 48]} />
        <meshBasicMaterial
          color={portal.accentColor}
          transparent
          opacity={0.38}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh
        ref={secondRippleRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.035, 0]}
        userData={{ ignoreAdOcclusion: true }}
      >
        <ringGeometry args={[0.84, 0.89, 48]} />
        <meshBasicMaterial
          color={portal.glowColor}
          transparent
          opacity={0.28}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Step / Click Trigger Ripple Burst */}
      <mesh
        ref={pulseBurstRef}
        visible={false}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.04, 0]}
        userData={{ ignoreAdOcclusion: true }}
      >
        <ringGeometry args={[0.78, 0.96, 56]} />
        <meshBasicMaterial
          color="#fef3c7"
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Ethereal Vertical Moonlight Filaments */}
      <group ref={filamentGroupRef} userData={{ ignoreAdOcclusion: true }}>
        {filamentAngles.map((ang, i) => {
          const r = 0.76;
          const h = i % 2 === 0 ? 1.55 : 1.05;
          return (
            <mesh
              key={ang}
              position={[Math.cos(ang) * r, h * 0.5 + 0.05, Math.sin(ang) * r]}
              userData={{ ignoreAdOcclusion: true }}
            >
              <cylinderGeometry args={[0.006, 0.014, h, 6]} />
              <meshBasicMaterial
                color={portal.accentColor}
                transparent
                opacity={isSelected ? 0.45 : 0.24}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          );
        })}

        {/* Gossamer Hollow Light Veil */}
        <mesh position={[0, 0.62, 0]} userData={{ ignoreAdOcclusion: true }}>
          <cylinderGeometry args={[0.68, 0.82, 1.2, 32, 1, true]} />
          <meshBasicMaterial
            color={portal.glowColor}
            transparent
            opacity={isSelected ? 0.14 : 0.065}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

export interface MoonPortalsProps {
  portals: readonly SanctuaryPortal[];
  selectedPortalId: string | null;
  portalPulseMap: Readonly<Record<string, number>>;
  onSelectPortal: (portal: SanctuaryPortal) => void;
}

export function MoonPortals({
  portals,
  selectedPortalId,
  portalPulseMap,
  onSelectPortal,
}: MoonPortalsProps): ReactElement {
  const discTexture = useMemo(() => createMoonDiscTexture(), []);

  return (
    <group name="wolin-moon-portals" userData={{ ignoreAdOcclusion: true }}>
      {portals.map((portal, index) => (
        <SingleMoonPortalNode
          key={portal.id}
          portal={portal}
          index={index}
          isSelected={selectedPortalId === portal.id}
          pulseTimestamp={portalPulseMap[portal.id] ?? 0}
          discTexture={discTexture}
          onSelect={onSelectPortal}
        />
      ))}
    </group>
  );
}
