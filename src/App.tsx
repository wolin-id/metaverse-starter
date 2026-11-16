import { Canvas } from '@react-three/fiber';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  MediaStageScreen,
  useWolinAuth,
  type ViewableImpressionPayload,
  WolinAdSlot,
  WolinAuthPanel,
  WolinAuthProvider,
} from './blocks';
import { buildSanctuaryPortals, type SanctuaryPortal } from './scene/MoonPortals';
import {
  createMeditationAudioController,
  type MeditationAudioController,
} from './scene/meditationAudio';
import { PortalScreenProjector } from './scene/ProjectedHtmlOverlay';
import {
  createDriftingLotusLantern,
  INITIAL_LOTUS_LANTERNS,
  type LotusLanternItem,
  type SanctuaryCameraMode,
  WolinSanctuary,
} from './scene/WolinSanctuary';
import { SANDBOX_PASSPORT_PRESETS } from './wolin/client';

const DEFAULT_STAGE_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const MAX_FLOATING_LANTERNS = 18;

function SanctuaryExperience(): ReactElement {
  const {
    session,
    isLoading,
    loginWithWolin,
    loginSandboxPreset,
    addCustomWorldLink,
  } = useWolinAuth();

  const portals = useMemo(
    () => buildSanctuaryPortals(session?.worldLinks ?? []),
    [session?.worldLinks],
  );

  const [selectedPortal, setSelectedPortal] = useState<SanctuaryPortal | null>(null);
  const [portalPulseMap, setPortalPulseMap] = useState<Record<string, number>>({});
  const portalLabelRefs = useRef<Record<string, HTMLElement | null>>({});
  const [lanterns, setLanterns] = useState<LotusLanternItem[]>(() => [
    ...INITIAL_LOTUS_LANTERNS,
  ]);
  const lanternSeqRef = useRef<number>(INITIAL_LOTUS_LANTERNS.length + 1);
  const avatarPosRef = useRef<[number, number]>([1.05, 4.85]);
  const [walkTarget, setWalkTarget] = useState<[number, number] | null>(null);

  const [cameraMode, setCameraMode] = useState<SanctuaryCameraMode>('explore');
  const [cameraModeNonce, setCameraModeNonce] = useState<number>(0);

  // Meditation Web Audio Singing-Bowl Controller
  const audioRef = useRef<MeditationAudioController | null>(null);
  const [audioMuted, setAudioMuted] = useState<boolean>(false);

  // Minimal Glassmorphic Overlays & Drawers
  const [explorerMenuOpen, setExplorerMenuOpen] = useState<boolean>(false);
  const [portalsTrayOpen, setPortalsTrayOpen] = useState<boolean>(false);
  const [blocksDrawerOpen, setBlocksDrawerOpen] = useState<boolean>(false);

  // Sovereign Lego Blocks #2 & #3 State
  const [showMediaStage, setShowMediaStage] = useState<boolean>(false);
  const [liveUrl, setLiveUrl] = useState<string>(DEFAULT_STAGE_URL);
  const [urlDraft, setUrlDraft] = useState<string>(DEFAULT_STAGE_URL);
  const [podWorldDraft, setPodWorldDraft] = useState<string>('');
  const [showOccluderWall, setShowOccluderWall] = useState<boolean>(false);
  const [impressions, setImpressions] = useState<ViewableImpressionPayload[]>([]);

  useEffect(() => {
    const ctrl = createMeditationAudioController();
    audioRef.current = ctrl;
    return () => {
      ctrl.dispose();
      audioRef.current = null;
    };
  }, []);

  const handleImpression = useCallback((payload: ViewableImpressionPayload) => {
    setImpressions((prev) => [payload, ...prev].slice(0, 5));
  }, []);

  const handleSelectPortal = useCallback((portal: SanctuaryPortal) => {
    setPortalPulseMap((prev) => ({
      ...prev,
      [portal.id]: performance.now(),
    }));
    setSelectedPortal(portal);
    setPortalsTrayOpen(false);
    setExplorerMenuOpen(false);
  }, []);

  const handleWalkAndPreviewPortal = useCallback(
    (portal: SanctuaryPortal) => {
      setWalkTarget([portal.position[0], portal.position[2]]);
      handleSelectPortal(portal);
    },
    [handleSelectPortal],
  );

  const handleToggleMeditation = useCallback(() => {
    setExplorerMenuOpen(false);
    setPortalsTrayOpen(false);
    setBlocksDrawerOpen(false);

    setCameraMode((prev) => {
      const next = prev === 'meditate' ? 'explore' : 'meditate';
      if (next === 'meditate') {
        setSelectedPortal(null);
        audioRef.current?.start();
      } else {
        audioRef.current?.stop();
      }
      return next;
    });
    setCameraModeNonce((n) => n + 1);
  }, []);

  const handleToggleAudioMute = useCallback(() => {
    setAudioMuted((prev) => {
      const next = !prev;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleFloatLantern = useCallback(() => {
    const seq = lanternSeqRef.current++;
    const nowSec = performance.now() / 1000;
    const spawned = createDriftingLotusLantern(seq, avatarPosRef.current, nowSec);
    setLanterns((prev) => [...prev.slice(-(MAX_FLOATING_LANTERNS - 1)), spawned]);
  }, []);

  const handleLakeWalkTarget = useCallback((xz: [number, number]) => {
    setWalkTarget(xz);
  }, []);

  const handleAvatarPositionChange = useCallback((xz: [number, number]) => {
    avatarPosRef.current = xz;
  }, []);

  const explorerChipLabel = session
    ? `${session.displayName} · ${session.handle}`
    : 'Guest · wolin.id';

  const isMeditating = cameraMode === 'meditate';

  return (
    <div className="app-viewport">
      {/* Isolated 3D Stacking Context so HTML markers never pierce top HUD */}
      <div className="canvas-layer">
        <Canvas
          shadows
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          camera={{ position: [0, 3.15, 13.4], fov: 47, near: 0.1, far: 260 }}
          dpr={[1, 2]}
        >
          <WolinSanctuary
            portals={portals}
            selectedPortalId={selectedPortal?.id ?? null}
            portalPulseMap={portalPulseMap}
            lanterns={lanterns}
            cameraMode={cameraMode}
            cameraModeNonce={cameraModeNonce}
            walkTarget={walkTarget}
            onLakeWalkTarget={handleLakeWalkTarget}
            onAvatarPositionChange={handleAvatarPositionChange}
            onSelectPortal={handleSelectPortal}
          >
            {/* Lego Block #2: Optional 3D YouTube / CHZZK Stage Screen + WebRTC P2P Voice */}
            {showMediaStage && (
              <MediaStageScreen
                position={[-8.6, 0.04, -5.2]}
                rotation={[0, 0.54, 0]}
                stageTitle="Moonlit Amphitheater · Live Stage"
                liveUrl={liveUrl}
                onLiveUrlChange={(next) => {
                  setLiveUrl(next);
                  setUrlDraft(next);
                }}
              />
            )}

            {/* Lego Block #3: Zero-PII 3D Spatial AdSlot tucked on outer eastern sanctuary rim */}
            <WolinAdSlot
              slotId="sanctuary-east-stele-01"
              worldContext="wolin-bodhi-sanctuary"
              position={[15.5, 1.55, 4.2]}
              rotation={[0, -1.15, 0]}
              showTelemetryBadge={blocksDrawerOpen || cameraMode === 'ad-focus'}
              onViewableImpression={handleImpression}
            />

            {/* Optional Interactive Occluder Pillar to verify Raycast Line-of-Sight Culling */}
            {showOccluderWall && (
              <mesh
                position={[13.2, 1.65, 5.8]}
                rotation={[0, -1.05, 0]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[2.6, 3.4, 0.28]} />
                <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
              </mesh>
            )}

            <PortalScreenProjector
              portals={portals}
              labelRefs={portalLabelRefs}
              yOffset={1.26}
              edgePaddingPx={8}
            />
          </WolinSanctuary>
        </Canvas>

        {/* Crisp 1:1 DPI Projected Moon Portal Labels (trapped inside .canvas-layer stacking context) */}
        <div className="portal-labels-layer" aria-label="Salt Lake Moon Portal Markers">
          {portals.map((portal) => {
            const isSelected = selectedPortal?.id === portal.id;
            return (
              <button
                key={portal.id}
                ref={(el) => {
                  portalLabelRefs.current[portal.id] = el;
                }}
                type="button"
                className={`moon-portal-label projected-portal-pin ${isSelected ? 'selected' : ''}`}
                onClick={() => handleWalkAndPreviewPortal(portal)}
              >
                <span
                  className="moon-portal-orb"
                  style={{
                    backgroundColor: portal.accentColor,
                    boxShadow: `0 0 8px ${portal.glowColor}`,
                  }}
                />
                <span className="moon-portal-text">
                  <strong>
                    {portal.code} · {portal.title}
                  </strong>
                  <small>{portal.subtitle}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Minimal Top Translucent Bar */}
      <header className="sanctuary-topbar" aria-label="Wolin Sanctuary Header">
        <div className="sanctuary-brand-pill">
          <span className="sanctuary-moon-glyph" aria-hidden="true" />
          <span className="sanctuary-brand-title">Wolin · 月印千江</span>
          <span className="sanctuary-brand-sub">Bodhi Sanctuary</span>
        </div>

        <div className="sanctuary-top-right">
          {isMeditating && (
            <button
              type="button"
              className={`sanctuary-audio-pill ${audioMuted ? 'muted' : ''}`}
              onClick={handleToggleAudioMute}
              aria-label={audioMuted ? 'Unmute singing bowl chime' : 'Mute singing bowl chime'}
            >
              {audioMuted ? '🔇 Muted' : '🔊 Bowl'}
            </button>
          )}

          <div className="explorer-chip-anchor">
            <button
              type="button"
              className="explorer-chip-btn"
              aria-expanded={explorerMenuOpen}
              onClick={() => {
                setExplorerMenuOpen((v) => !v);
                setPortalsTrayOpen(false);
              }}
            >
              <span
                className="explorer-status-dot"
                data-guest={session ? 'false' : 'true'}
              />
              <span className="explorer-chip-label">{explorerChipLabel}</span>
            </button>

            {explorerMenuOpen && (
              <div className="glass-popover explorer-popover" role="dialog" aria-label="Switch Wolin Explorer">
                <div className="popover-header">
                  <span>Active Sovereign Explorer</span>
                  <a
                    href="https://auth.wolin.id/passport/jarvis"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="popover-ext-link"
                  >
                    Passport ↗
                  </a>
                </div>
                <div className="explorer-preset-list">
                  {SANDBOX_PASSPORT_PRESETS.map((preset) => {
                    const handleFull = `${preset.handle}.wolin.id`;
                    const isActive = session?.handle === handleFull;
                    return (
                      <button
                        key={preset.handle}
                        type="button"
                        className={`explorer-preset-item ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          void loginSandboxPreset(preset);
                          setExplorerMenuOpen(false);
                        }}
                      >
                        <strong>{preset.displayName}</strong>
                        <span>{handleFull}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="primary-btn full-width-btn"
                  disabled={isLoading}
                  onClick={() => {
                    setExplorerMenuOpen(false);
                    void loginWithWolin();
                  }}
                >
                  {isLoading ? 'Connecting...' : 'Sign in with auth.wolin.id'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Portal Preview Card (Click or Walk onto a Moon Reflection Portal) */}
      {selectedPortal && (
        <section
          className="portal-preview-card"
          role="dialog"
          aria-label={`${selectedPortal.code} ${selectedPortal.title}`}
        >
          <div className="portal-preview-top">
            <span
              className="portal-code-badge"
              style={{ borderColor: selectedPortal.accentColor, color: selectedPortal.accentColor }}
            >
              {selectedPortal.code}
            </span>
            <span className="portal-kind-tag">
              {selectedPortal.isCustomPodLink ? 'Pod wolin:worldLinks' : 'Salt Lake Mirror Portal'}
            </span>
          </div>
          <h2 className="portal-preview-title">{selectedPortal.title}</h2>
          <p className="portal-preview-sub">{selectedPortal.subtitle}</p>
          <p className="portal-preview-desc">{selectedPortal.description}</p>

          <div className="portal-preview-actions">
            <a
              href={selectedPortal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="portal-enter-btn"
            >
              Enter World ↗
            </a>
            <button
              type="button"
              className="portal-stay-btn"
              onClick={() => setSelectedPortal(null)}
            >
              Stay
            </button>
          </div>
        </section>
      )}

      {/* Portals Quick-Jump Sheet */}
      {portalsTrayOpen && (
        <section className="glass-sheet portals-sheet" aria-label="Moon Reflection Portals">
          <div className="sheet-header">
            <div>
              <strong>달 그림자 포털 · Moon Portals ({portals.length})</strong>
              <p>Walk with WASD / click the lake, or tap a moon reflection to preview.</p>
            </div>
            <button
              type="button"
              className="sheet-close-btn"
              onClick={() => setPortalsTrayOpen(false)}
              aria-label="Close Portals Tray"
            >
              ✕
            </button>
          </div>

          <div className="portal-list-grid">
            {portals.map((portal) => (
              <button
                key={portal.id}
                type="button"
                className={`portal-list-item ${selectedPortal?.id === portal.id ? 'active' : ''}`}
                onClick={() => handleWalkAndPreviewPortal(portal)}
              >
                <span
                  className="portal-list-dot"
                  style={{ backgroundColor: portal.accentColor }}
                />
                <span className="portal-list-meta">
                  <strong>
                    {portal.code} · {portal.title}
                  </strong>
                  <small>{portal.subtitle}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Blocks ▾ Drawer (Houses All 4 Sovereign Lego Blocks cleanly) */}
      {blocksDrawerOpen && (
        <aside className="glass-sheet blocks-drawer" aria-label="Metaverse Lego Blocks Controls">
          <div className="sheet-header">
            <div>
              <strong>4 Sovereign Lego Blocks</strong>
              <p>Identity, Zero-Egress Stage, Spatial AdSlot &amp; Solid-OIDC Client ID</p>
            </div>
            <div className="hud-header-actions">
              <a
                href="/client-id.jsonld"
                target="_blank"
                rel="noreferrer"
                className="hud-badge-link"
                title="Inspect Solid-OIDC Client ID Document (Block 04)"
              >
                client-id ↗
              </a>
              <button
                type="button"
                className="sheet-close-btn"
                onClick={() => setBlocksDrawerOpen(false)}
                aria-label="Close Blocks Drawer"
              >
                ✕
              </button>
            </div>
          </div>

          <WolinAuthPanel />

          {session && (
            <section className="hud-card" aria-label="Pod World Links Portal Builder">
              <div className="hud-card-header">
                <span className="hud-badge">Pod · wolin:worldLinks</span>
              </div>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!podWorldDraft.trim()) return;
                  addCustomWorldLink(podWorldDraft);
                  setPodWorldDraft('');
                }}
              >
                <input
                  type="url"
                  value={podWorldDraft}
                  onChange={(e) => setPodWorldDraft(e.target.value)}
                  placeholder="https://my-world.example.com"
                  aria-label="Add Custom Pod World Portal URL"
                />
                <button type="submit" className="secondary-btn">
                  + Portal
                </button>
              </form>
            </section>
          )}

          <section className="hud-card" aria-label="Stage Broadcast Controls">
            <div className="hud-card-header">
              <span className="hud-badge">Block 02 · Live Stage &amp; P2P Voice</span>
              <div className="inline-chip-group">
                <button
                  type="button"
                  className={`chip-btn ${showMediaStage ? 'active' : ''}`}
                  onClick={() => {
                    setShowMediaStage((prev) => {
                      const next = !prev;
                      if (next) {
                        setCameraMode('stage-focus');
                        setCameraModeNonce((n) => n + 1);
                      } else if (cameraMode === 'stage-focus') {
                        setCameraMode('explore');
                        setCameraModeNonce((n) => n + 1);
                      }
                      return next;
                    });
                  }}
                >
                  {showMediaStage ? 'Hide Stage' : 'Show Stage'}
                </button>
              </div>
            </div>
            {showMediaStage ? (
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
            ) : (
              <p className="hud-copy">
                Optional floating amphitheater screen (hidden by default to keep the salt lake serene).
              </p>
            )}
          </section>

          <section className="hud-card" aria-label="Spatial Ad Viewability Inspector">
            <div className="hud-card-header">
              <span className="hud-badge">Block 03 · Zero-PII Spatial AdSlot</span>
              <div className="inline-chip-group">
                <button
                  type="button"
                  className={`chip-btn ${cameraMode === 'ad-focus' ? 'active' : ''}`}
                  onClick={() => {
                    setCameraMode((prev) => (prev === 'ad-focus' ? 'explore' : 'ad-focus'));
                    setCameraModeNonce((n) => n + 1);
                  }}
                >
                  {cameraMode === 'ad-focus' ? 'Reset View' : 'Focus Ad'}
                </button>
                <button
                  type="button"
                  className={`chip-btn ${showOccluderWall ? 'active' : ''}`}
                  onClick={() => setShowOccluderWall((v) => !v)}
                >
                  {showOccluderWall ? 'Remove Wall' : 'Occluder'}
                </button>
              </div>
            </div>
            <p className="hud-copy">
              MRC-3D viewability (&ge;5% screen area, raycast line-of-sight, 1.5s continuous gaze).
            </p>
            {impressions.length > 0 && (
              <div className="impression-log" role="status">
                <strong>Verified Impressions ({impressions.length})</strong>
                <span>
                  {impressions[0]!.slotId} ·{' '}
                  {(impressions[0]!.screenAreaRatio * 100).toFixed(1)}% area ·{' '}
                  {impressions[0]!.dwellMs}ms
                </span>
              </div>
            )}
          </section>
        </aside>
      )}

      {/* Bottom Floating Contemplative Action Dock (>=44px touch targets, 0px overflow on 390px) */}
      <nav className="sanctuary-bottom-dock" aria-label="Sanctuary Contemplative Actions">
        <button
          type="button"
          className={`dock-action-btn ${isMeditating ? 'active-gold' : ''}`}
          aria-pressed={isMeditating}
          onClick={handleToggleMeditation}
        >
          <span className="dock-btn-en">Meditate</span>
          <span className="dock-btn-ko">달멍</span>
        </button>

        <button
          type="button"
          className="dock-action-btn"
          onClick={handleFloatLantern}
        >
          <span className="dock-btn-en">Float Lantern</span>
          <span className="dock-btn-ko">연등 ({lanterns.length})</span>
        </button>

        <button
          type="button"
          className={`dock-action-btn ${portalsTrayOpen ? 'active' : ''}`}
          aria-expanded={portalsTrayOpen}
          onClick={() => {
            setPortalsTrayOpen((v) => !v);
            setBlocksDrawerOpen(false);
            setExplorerMenuOpen(false);
          }}
        >
          <span className="dock-btn-en">Portals ({portals.length})</span>
          <span className="dock-btn-ko">달 포털</span>
        </button>

        <button
          type="button"
          className={`dock-action-btn ${blocksDrawerOpen ? 'active' : ''}`}
          aria-expanded={blocksDrawerOpen}
          onClick={() => {
            setBlocksDrawerOpen((v) => !v);
            setPortalsTrayOpen(false);
            setExplorerMenuOpen(false);
          }}
        >
          <span className="dock-btn-en">Blocks ▾</span>
          <span className="dock-btn-ko">레고 블록</span>
        </button>
      </nav>
    </div>
  );
}

export function App(): ReactElement {
  return (
    <WolinAuthProvider>
      <SanctuaryExperience />
    </WolinAuthProvider>
  );
}
