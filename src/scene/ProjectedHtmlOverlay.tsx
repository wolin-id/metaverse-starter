import { useFrame } from '@react-three/fiber';
import { type ReactElement, type RefObject, useMemo } from 'react';
import * as THREE from 'three';
import type { SanctuaryPortal } from './MoonPortals';

export interface PortalScreenProjectorProps {
  portals: readonly SanctuaryPortal[];
  labelRefs: RefObject<Record<string, HTMLElement | null>>;
  hidden?: boolean;
  yOffset?: number;
  edgePaddingPx?: number;
  topSafePx?: number;
  bottomSafePx?: number;
}

interface ProjectedPinPlacement {
  el: HTMLElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Pure R3F 60fps projector that projects 3D Moon Portal world positions into
 * 2D screen coordinates with safe-area culling and pairwise vertical de-collision.
 */
export function PortalScreenProjector({
  portals,
  labelRefs,
  hidden = false,
  yOffset = 1.32,
  edgePaddingPx = 8,
  topSafePx = 66,
  bottomSafePx = 76,
}: PortalScreenProjectorProps): ReactElement | null {
  const worldVec = useMemo(() => new THREE.Vector3(), []);
  const viewVec = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera, size }) => {
    const map = labelRefs.current;
    if (!map) return;

    if (hidden) {
      for (const portal of portals) {
        const el = map[portal.id];
        if (el) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
        }
      }
      return;
    }

    camera.updateMatrixWorld();
    const candidates: ProjectedPinPlacement[] = [];

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

      const w = el.offsetWidth || 140;
      const h = el.offsetHeight || 44;
      const halfW = w * 0.5;
      const halfH = h * 0.5;

      // Cull pins outside horizontal bounds or intersecting top/bottom HUD safe zones
      if (
        rawX < -90 ||
        rawX > size.width + 90 ||
        rawY - halfH < topSafePx ||
        rawY + halfH > size.height - bottomSafePx
      ) {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        continue;
      }

      const minX = halfW + edgePaddingPx;
      const maxX = Math.max(minX, size.width - halfW - edgePaddingPx);
      const clampedX = THREE.MathUtils.clamp(rawX, minX, maxX);

      candidates.push({ el, x: clampedX, y: rawY, w, h });
    }

    // Sort bottom-to-top so foreground portals anchor first and rear portals stack cleanly above
    candidates.sort((a, b) => b.y - a.y);
    const placed: ProjectedPinPlacement[] = [];

    for (const item of candidates) {
      let adjustedY = item.y;
      for (const prev of placed) {
        const minDx = (item.w + prev.w) * 0.5 + 4;
        const minDy = (item.h + prev.h) * 0.5 + 6;
        if (Math.abs(item.x - prev.x) < minDx && Math.abs(adjustedY - prev.y) < minDy) {
          adjustedY = prev.y - minDy;
        }
      }

      if (adjustedY - item.h * 0.5 < topSafePx) {
        item.el.style.opacity = '0';
        item.el.style.pointerEvents = 'none';
        continue;
      }

      item.y = adjustedY;
      placed.push(item);
      item.el.style.opacity = '1';
      item.el.style.pointerEvents = 'auto';
      item.el.style.transform = `translate3d(${item.x.toFixed(1)}px, ${item.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  });

  return null;
}
