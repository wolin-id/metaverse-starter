import { useFrame } from '@react-three/fiber';
import { type ReactElement, type RefObject, useMemo } from 'react';
import * as THREE from 'three';
import type { SanctuaryPortal } from './MoonPortals';

export interface PortalScreenProjectorProps {
  portals: readonly SanctuaryPortal[];
  labelRefs: RefObject<Record<string, HTMLElement | null>>;
  yOffset?: number;
  edgePaddingPx?: number;
}

/**
 * Pure R3F 60fps projector that projects 3D Moon Portal world positions into
 * 2D screen coordinates and updates standard React DOM label elements outside `<Canvas>`.
 */
export function PortalScreenProjector({
  portals,
  labelRefs,
  yOffset = 1.32,
  edgePaddingPx = 10,
}: PortalScreenProjectorProps): ReactElement | null {
  const worldVec = useMemo(() => new THREE.Vector3(), []);
  const viewVec = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera, size }) => {
    const map = labelRefs.current;
    if (!map) return;

    camera.updateMatrixWorld();

    for (const portal of portals) {
      const el = map[portal.id];
      if (!el) continue;

      worldVec.set(portal.position[0], portal.position[1] + yOffset, portal.position[2]);
      viewVec.copy(worldVec).applyMatrix4(camera.matrixWorldInverse);

      if (viewVec.z > -0.25) {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        continue;
      }

      worldVec.project(camera);
      const rawX = (worldVec.x * 0.5 + 0.5) * size.width;
      const rawY = (-worldVec.y * 0.5 + 0.5) * size.height;

      if (rawX < -90 || rawX > size.width + 90 || rawY < -60 || rawY > size.height + 60) {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        continue;
      }

      const halfW = el.offsetWidth * 0.5;
      const minX = halfW + edgePaddingPx;
      const maxX = Math.max(minX, size.width - halfW - edgePaddingPx);
      const clampedX = THREE.MathUtils.clamp(rawX, minX, maxX);

      el.style.opacity = '1';
      el.style.pointerEvents = 'auto';
      el.style.transform = `translate3d(${clampedX.toFixed(1)}px, ${rawY.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  });

  return null;
}
