import { Grid, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { type ReactElement, useCallback, useState } from 'react';
import {
  MediaStageScreen,
  type ViewableImpressionPayload,
  WolinAdSlot,
  WolinAuthAndAvatar,
  WolinAuthPanel,
  WolinAuthProvider,
} from './blocks';

const DEFAULT_STAGE_URL = 'https://www.youtube.com/watch?v=jfKfPfyJRdk';

export function App(): ReactElement {
  const [liveUrl, setLiveUrl] = useState<string>(DEFAULT_STAGE_URL);
  const [urlDraft, setUrlDraft] = useState<string>(DEFAULT_STAGE_URL);
  const [showOccluderWall, setShowOccluderWall] = useState<boolean>(false);
  const [impressions, setImpressions] = useState<ViewableImpressionPayload[]>([]);

  const handleImpression = useCallback((payload: ViewableImpressionPayload) => {
    setImpressions((prev) => [payload, ...prev].slice(0, 5));
  }, []);

  return (
    <WolinAuthProvider>
      <div className="app-viewport">
        {/* Isolated 3D Stacking Context so CSS/HTML markers never pierce top HUD */}
        <div className="canvas-layer">
          <Canvas
            shadows
            camera={{ position: [0, 3.2, 6.8], fov: 50, near: 0.1, far: 120 }}
            dpr={[1, 2]}
          >
            <color attach="background" args={['#060911']} />
            <fog attach="fog" args={['#060911', 16, 46]} />

            <ambientLight intensity={0.65} />
            <directionalLight
              position={[7, 12, 8]}
              intensity={1.45}
              castShadow
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
            />
            <pointLight position={[-5, 4, 2]} intensity={0.7} color="#38bdf8" />

            {/* Lunar Obsidian Plaza Floor */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0, 0]}
              receiveShadow
              userData={{ ignoreAdOcclusion: true }}
            >
              <circleGeometry args={[26, 64]} />
              <meshStandardMaterial color="#0b101d" roughness={0.82} metalness={0.22} />
            </mesh>

            <Grid
              position={[0, 0.01, 0]}
              args={[40, 40]}
              cellSize={1}
              cellThickness={0.5}
              cellColor="#1e293b"
              sectionSize={5}
              sectionThickness={1}
              sectionColor="#334155"
              fadeDistance={30}
              fadeStrength={1}
              userData={{ ignoreAdOcclusion: true }}
            />

            {/* Lego Block #1: Passwordless Wolin Auth & 3D Avatar (ns#avatarGlbUrl + Low-Poly Fallback) */}
            <WolinAuthAndAvatar position={[0, 0, 1.4]} />

            {/* Lego Block #2: Zero-Egress YouTube / CHZZK Stage Screen + WebRTC P2P Voice Stub */}
            <MediaStageScreen
              position={[0, 0, -5.6]}
              liveUrl={liveUrl}
              onLiveUrlChange={(next) => {
                setLiveUrl(next);
                setUrlDraft(next);
              }}
            />

            {/* Lego Block #3: Zero-PII 3D Spatial AdSlot (Frustum + >=5% Area + Raycast + 1.5s Dwell) */}
            <WolinAdSlot
              slotId="plaza-east-billboard-01"
              worldContext="wolin-lunar-plaza"
              position={[4.2, 2.0, -1.5]}
              rotation={[0, -0.52, 0]}
              onViewableImpression={handleImpression}
            />

            {/* Optional Interactive Occluder Pillar to verify Raycast Line-of-Sight Culling */}
            {showOccluderWall && (
              <mesh position={[2.25, 1.75, 1.85]} rotation={[0, -0.45, 0]} castShadow receiveShadow>
                <boxGeometry args={[2.5, 3.5, 0.28]} />
                <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
              </mesh>
            )}

            <OrbitControls
              makeDefault
              target={[0, 1.6, -1.4]}
              minDistance={2.8}
              maxDistance={18}
              maxPolarAngle={Math.PI / 2 - 0.04}
            />
          </Canvas>
        </div>

        {/* Top-Layer 2D Controls Dock */}
        <aside className="hud-dock" aria-label="Metaverse Lego Blocks Controls">
          <header className="hud-brand">
            <div>
              <h1>Wolin Metaverse Starter</h1>
              <p>4 Sovereign Spatial Lego Blocks · React 19 + R3F</p>
            </div>
            <a
              href="/client-id.jsonld"
              target="_blank"
              rel="noreferrer"
              className="hud-badge-link"
              title="Inspect Solid-OIDC Client ID Document (Block 04)"
            >
              Block 04 · client-id.jsonld ↗
            </a>
          </header>

          <WolinAuthPanel />

          <section className="hud-card" aria-label="Stage Broadcast Controls">
            <div className="hud-card-header">
              <span className="hud-badge">Block 02 · Live Stage & P2P Voice</span>
            </div>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                setLiveUrl(urlDraft);
              }}
            >
              <input
                type="url"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="YouTube or CHZZK Live URL"
                aria-label="Broadcast Stream URL"
              />
              <button type="submit" className="secondary-btn">
                Load
              </button>
            </form>
          </section>

          <section className="hud-card" aria-label="Spatial Ad Viewability Inspector">
            <div className="hud-card-header">
              <span className="hud-badge">Block 03 · Zero-PII Spatial AdSlot</span>
              <button
                type="button"
                className={`chip-btn ${showOccluderWall ? 'active' : ''}`}
                onClick={() => setShowOccluderWall((v) => !v)}
              >
                {showOccluderWall ? 'Remove Wall' : 'Test Occluder Wall'}
              </button>
            </div>
            <p className="hud-copy">
              Orbit toward the right billboard (&ge;5% screen area, unobstructed raycast, 1.5s
              continuous gaze) to trigger a verified Zero-PII impression.
            </p>
            {impressions.length > 0 && (
              <div className="impression-log" role="status">
                <strong>Verified Impressions ({impressions.length})</strong>
                <span>
                  {impressions[0]!.slotId} · {(impressions[0]!.screenAreaRatio * 100).toFixed(1)}%
                  area · {impressions[0]!.dwellMs}ms
                </span>
              </div>
            )}
          </section>
        </aside>
      </div>
    </WolinAuthProvider>
  );
}
