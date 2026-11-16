import { Html } from '@react-three/drei';
import { type ThreeElements, useFrame } from '@react-three/fiber';
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  createSandboxPassportSession,
  createSolidAuthRequest,
  DEFAULT_WOLIN_ISSUER,
  discoverOidcProvider,
  exchangeCodeForTokens,
  extractHandleFromWebId,
  fetchWebIdProfile,
  generateDPoPKeyPair,
  resolveOriginClientId,
  SANDBOX_PASSPORT_PRESETS,
  type SandboxPassportPreset,
  sanitizeHttpAssetUrl,
  verifyWebIdOidcIssuer,
  type WebIdProfile,
  type WolinSession,
} from '../wolin/client';

const PENDING_OIDC_STORAGE_KEY = 'wolin:metaverse:pending_oidc';

interface StoredPendingOidc {
  codeVerifier: string;
  expectedState: string;
  tokenEndpoint: string;
  oidcIssuer: string;
  clientId: string;
  redirectUri: string;
}

export interface WolinAuthContextValue {
  session: WolinSession | null;
  profile: WebIdProfile | null;
  isLoading: boolean;
  statusMessage: string | null;
  loginWithWolin: (issuerUrl?: string) => Promise<void>;
  loginSandboxPreset: (preset?: SandboxPassportPreset) => Promise<void>;
  loadPublicWebId: (webId: string) => Promise<void>;
  setCustomAvatarGlbUrl: (glbUrl: string) => void;
  addCustomWorldLink: (worldUrl: string) => void;
  logout: () => void;
}

export const WolinAuthContext = createContext<WolinAuthContextValue | null>(null);

export interface WolinAuthProviderProps {
  children: ReactNode;
  defaultIssuer?: string;
  autoStartSandbox?: boolean;
}

export function WolinAuthProvider({
  children,
  defaultIssuer = DEFAULT_WOLIN_ISSUER,
  autoStartSandbox = true,
}: WolinAuthProviderProps): ReactElement {
  const [session, setSession] = useState<WolinSession | null>(null);
  const [profile, setProfile] = useState<WebIdProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loginSandboxPreset = useCallback(
    async (preset: SandboxPassportPreset = SANDBOX_PASSPORT_PRESETS[0]!) => {
      setIsLoading(true);
      setStatusMessage(null);
      try {
        const created = await createSandboxPassportSession(preset);
        setProfile(created.profile);
        setSession(created.session);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Handle Solid-OIDC redirect callback (?code=...&state=...) or boot initial Sandbox Passport
  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      if (typeof window !== 'undefined') {
        const currentUrl = new URL(window.location.href);
        const code = currentUrl.searchParams.get('code');
        const returnedState = currentUrl.searchParams.get('state');
        const rawPending = window.sessionStorage.getItem(PENDING_OIDC_STORAGE_KEY);

        if (code && returnedState && rawPending) {
          window.sessionStorage.removeItem(PENDING_OIDC_STORAGE_KEY);
          setIsLoading(true);
          try {
            const pending = JSON.parse(rawPending) as StoredPendingOidc;
            if (returnedState !== pending.expectedState) {
              throw new Error('Sign-in state expired. Please try signing in again.');
            }
            const dpopKeyPair = await generateDPoPKeyPair();
            const tokenSet = await exchangeCodeForTokens({
              tokenEndpoint: pending.tokenEndpoint,
              code,
              codeVerifier: pending.codeVerifier,
              redirectUri: pending.redirectUri,
              clientId: pending.clientId,
              dpopKeyPair,
            });
            if (!tokenSet.webId) {
              throw new Error('No Passport identity was returned by the provider.');
            }
            const loadedProfile = await fetchWebIdProfile(tokenSet.webId);
            verifyWebIdOidcIssuer(loadedProfile, pending.oidcIssuer);

            if (!cancelled) {
              const handle = extractHandleFromWebId(loadedProfile.webId);
              setProfile(loadedProfile);
              setSession({
                webId: loadedProfile.webId,
                handle: handle.includes('.') ? handle : `${handle}.wolin.id`,
                displayName: loadedProfile.name ?? handle,
                accessToken: tokenSet.accessToken,
                tokenType: tokenSet.tokenType,
                dpopKeyPair,
                podUrl: loadedProfile.primaryStorage,
                oidcIssuer: pending.oidcIssuer,
                avatarGlbUrl: loadedProfile.avatarGlbUrl,
                avatarVrmUrl: loadedProfile.avatarVrmUrl,
                passportTheme: loadedProfile.passportTheme,
                worldLinks: loadedProfile.worldLinks,
                wearableItems: loadedProfile.wearableItems,
                isSandbox: false,
              });
              currentUrl.searchParams.delete('code');
              currentUrl.searchParams.delete('state');
              currentUrl.searchParams.delete('iss');
              window.history.replaceState({}, '', currentUrl.toString());
            }
            return;
          } catch (err) {
            if (!cancelled) {
              setStatusMessage(
                err instanceof Error ? err.message : 'Unable to complete Wolin sign-in.',
              );
            }
          } finally {
            if (!cancelled) setIsLoading(false);
          }
        }
      }

      if (autoStartSandbox && !cancelled) {
        await loginSandboxPreset(SANDBOX_PASSPORT_PRESETS[0]!);
      }
    };

    void initAuth();
    return () => {
      cancelled = true;
    };
  }, [autoStartSandbox, loginSandboxPreset]);

  const loginWithWolin = useCallback(
    async (issuerUrl: string = defaultIssuer) => {
      setIsLoading(true);
      setStatusMessage(null);
      try {
        const { clientId, redirectUri } = resolveOriginClientId();
        const metadata = await discoverOidcProvider(issuerUrl);
        const authReq = await createSolidAuthRequest({
          authorizationEndpoint: metadata.authorization_endpoint,
          clientId,
          redirectUri,
        });

        if (typeof window !== 'undefined') {
          const pending: StoredPendingOidc = {
            codeVerifier: authReq.codeVerifier,
            expectedState: authReq.state,
            tokenEndpoint: metadata.token_endpoint,
            oidcIssuer: metadata.issuer,
            clientId,
            redirectUri,
          };
          window.sessionStorage.setItem(PENDING_OIDC_STORAGE_KEY, JSON.stringify(pending));
          window.location.assign(authReq.url);
        }
      } catch {
        // Clean Easy-UX fallback when testing offline or before live domain deployment
        await loginSandboxPreset(SANDBOX_PASSPORT_PRESETS[0]!);
        setStatusMessage(
          'Offline/local preview detected — signed in with Sandbox Wolin Passport.',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [defaultIssuer, loginSandboxPreset],
  );

  const loadPublicWebId = useCallback(async (webId: string) => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const loaded = await fetchWebIdProfile(webId);
      const handle = extractHandleFromWebId(loaded.webId);
      const dpopKeyPair = await generateDPoPKeyPair();
      setProfile(loaded);
      setSession({
        webId: loaded.webId,
        handle: handle.includes('.') ? handle : `${handle}.wolin.id`,
        displayName: loaded.name ?? handle,
        accessToken: `preview.${dpopKeyPair.jkt}`,
        tokenType: 'DPoP',
        dpopKeyPair,
        podUrl: loaded.primaryStorage,
        oidcIssuer: loaded.primaryOidcIssuer ?? DEFAULT_WOLIN_ISSUER,
        avatarGlbUrl: loaded.avatarGlbUrl,
        avatarVrmUrl: loaded.avatarVrmUrl,
        passportTheme: loaded.passportTheme,
        worldLinks: loaded.worldLinks,
        wearableItems: loaded.wearableItems,
        isSandbox: true,
      });
      setStatusMessage(`Loaded Passport avatar from ${handle}`);
    } catch {
      setStatusMessage('Could not reach that Passport URL — keeping current 3D avatar.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setCustomAvatarGlbUrl = useCallback((glbUrl: string) => {
    const clean = sanitizeHttpAssetUrl(glbUrl);
    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        avatarGlbUrl: clean,
      };
    });
    setStatusMessage(
      clean
        ? 'Updated wolin:avatarGlbUrl — loading 3D GLB model...'
        : 'Cleared custom GLB — showing stylized Wolin Explorer avatar.',
    );
  }, []);

  const addCustomWorldLink = useCallback((worldUrl: string) => {
    const clean = sanitizeHttpAssetUrl(worldUrl);
    if (!clean) {
      setStatusMessage('Please enter a valid https:// world URL.');
      return;
    }
    setSession((prev) => {
      if (!prev) return prev;
      if (prev.worldLinks.includes(clean)) return prev;
      return {
        ...prev,
        worldLinks: [...prev.worldLinks, clean],
      };
    });
    setStatusMessage(`Added wolin:worldLinks portal → ${clean}`);
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    setProfile(null);
    setStatusMessage('Signed out — browsing as Guest Explorer.');
  }, []);

  const value = useMemo<WolinAuthContextValue>(
    () => ({
      session,
      profile,
      isLoading,
      statusMessage,
      loginWithWolin,
      loginSandboxPreset,
      loadPublicWebId,
      setCustomAvatarGlbUrl,
      addCustomWorldLink,
      logout,
    }),
    [
      session,
      profile,
      isLoading,
      statusMessage,
      loginWithWolin,
      loginSandboxPreset,
      loadPublicWebId,
      setCustomAvatarGlbUrl,
      addCustomWorldLink,
      logout,
    ],
  );

  // React 19 direct Context provider syntax
  return <WolinAuthContext value={value}>{children}</WolinAuthContext>;
}

export function useWolinAuth(): WolinAuthContextValue {
  const ctx = useContext(WolinAuthContext);
  if (!ctx) {
    throw new Error('useWolinAuth must be used inside <WolinAuthProvider>');
  }
  return ctx;
}

function resolveThemePalette(theme?: string): {
  primary: string;
  accent: string;
  visor: string;
} {
  switch (theme) {
    case 'bodhi-gold':
      return { primary: '#064e3b', accent: '#F5F2EB', visor: '#10B981' };
    case 'obsidian-cyan':
      return { primary: '#1e293b', accent: '#22d3ee', visor: '#67e8f9' };
    case 'aurora-violet':
      return { primary: '#2e1065', accent: '#a855f7', visor: '#e879f9' };
    default:
      return { primary: '#131924', accent: '#F5F2EB', visor: '#10B981' };
  }
}

interface StylizedLowPolyAvatarProps {
  displayName: string;
  handle: string;
  passportTheme?: string;
  isGuest?: boolean;
}

function StylizedLowPolyAvatar({
  displayName,
  handle,
  passportTheme,
  isGuest = false,
}: StylizedLowPolyAvatarProps): ReactElement {
  const bodyGroupRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const palette = resolveThemePalette(passportTheme);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (bodyGroupRef.current) {
      bodyGroupRef.current.position.y = Math.sin(t * 2.2) * 0.05;
      bodyGroupRef.current.rotation.y = Math.sin(t * 0.8) * 0.14;
    }
    if (haloRef.current) {
      haloRef.current.rotation.z = t * 0.9;
    }
  });

  return (
    <group>
      {/* Ground pedestal shadow ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <ringGeometry args={[0.38, 0.56, 24]} />
        <meshBasicMaterial color={palette.visor} transparent opacity={0.45} />
      </mesh>

      <group ref={bodyGroupRef}>
        {/* Legs */}
        <mesh position={[-0.16, 0.34, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.07, 0.62, 6]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.4} flatShading />
        </mesh>
        <mesh position={[0.16, 0.34, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.07, 0.62, 6]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.4} flatShading />
        </mesh>

        {/* Faceted Low-Poly Torso */}
        <mesh position={[0, 0.96, 0]} castShadow>
          <cylinderGeometry args={[0.28, 0.2, 0.72, 7]} />
          <meshStandardMaterial
            color={palette.primary}
            roughness={0.28}
            metalness={0.72}
            flatShading
          />
        </mesh>

        {/* Specular Mercury Chest Emblem */}
        <mesh position={[0, 1.02, 0.24]} castShadow>
          <octahedronGeometry args={[0.1, 0]} />
          <meshStandardMaterial
            color={palette.accent}
            emissive={palette.visor}
            emissiveIntensity={0.55}
            metalness={0.9}
            roughness={0.15}
            flatShading
          />
        </mesh>

        {/* Floating Low-Poly Hands */}
        <mesh position={[-0.44, 0.92, 0.06]} castShadow>
          <dodecahedronGeometry args={[0.1, 0]} />
          <meshStandardMaterial color={palette.accent} metalness={0.7} roughness={0.25} flatShading />
        </mesh>
        <mesh position={[0.44, 0.92, 0.06]} castShadow>
          <dodecahedronGeometry args={[0.1, 0]} />
          <meshStandardMaterial color={palette.accent} metalness={0.7} roughness={0.25} flatShading />
        </mesh>

        {/* Stylized Helmet Head */}
        <mesh position={[0, 1.56, 0]} castShadow>
          <icosahedronGeometry args={[0.27, 1]} />
          <meshStandardMaterial
            color={palette.accent}
            metalness={0.82}
            roughness={0.2}
            flatShading
          />
        </mesh>

        {/* Luminous Horizon Visor */}
        <mesh position={[0, 1.57, 0.21]}>
          <boxGeometry args={[0.34, 0.11, 0.12]} />
          <meshStandardMaterial
            color={palette.visor}
            emissive={palette.visor}
            emissiveIntensity={1.2}
            roughness={0.1}
          />
        </mesh>

        {/* Lunar Crescent Halo Ring */}
        <mesh ref={haloRef} position={[0, 1.96, 0]} rotation={[Math.PI / 2.3, 0, 0]}>
          <torusGeometry args={[0.22, 0.022, 8, 24, Math.PI * 1.45]} />
          <meshStandardMaterial
            color="#f8fafc"
            emissive={palette.visor}
            emissiveIntensity={0.9}
          />
        </mesh>
      </group>

      {/* Overhead Nameplate */}
      <Html position={[0, 2.35, 0]} center distanceFactor={9} zIndexRange={[20, 0]}>
        <div className="wolin-avatar-tag">
          <span className="wolin-avatar-dot" data-guest={isGuest ? 'true' : 'false'} />
          <div>
            <div className="wolin-avatar-name">{displayName}</div>
            <div className="wolin-avatar-handle">{handle}</div>
          </div>
        </div>
      </Html>
    </group>
  );
}

export type WolinAuthAndAvatarProps = ThreeElements['group'] & {
  overrideAvatarGlbUrl?: string;
};

/**
 * Metaverse Lego Block #1: `<WolinAuthAndAvatar />`
 *
 * Reads `https://wolin.id/ns#avatarGlbUrl` from the active Wolin Passport session,
 * loads the user's cross-world `.glb` 3D model when available, and automatically
 * falls back to a stylized low-poly 3D Lunar Explorer avatar on offline/missing assets.
 */
export function WolinAuthAndAvatar({
  overrideAvatarGlbUrl,
  ...groupProps
}: WolinAuthAndAvatarProps): ReactElement {
  const { session } = useWolinAuth();
  const resolvedGlbUrl = sanitizeHttpAssetUrl(overrideAvatarGlbUrl ?? session?.avatarGlbUrl);
  const [loadedScene, setLoadedScene] = useState<THREE.Group | null>(null);

  useEffect(() => {
    if (!resolvedGlbUrl) {
      setLoadedScene(null);
      return;
    }

    let cancelled = false;
    const loader = new GLTFLoader();
    loader.setCrossOrigin('anonymous');

    loader.load(
      resolvedGlbUrl,
      (gltf) => {
        if (cancelled) return;
        const cloned = gltf.scene.clone(true);
        const box = new THREE.Box3().setFromObject(cloned);
        const size = box.getSize(new THREE.Vector3());
        const maxAxis = Math.max(size.x, size.y, size.z, 0.001);
        const targetHeight = 1.85;
        const scale = targetHeight / maxAxis;
        cloned.scale.setScalar(scale);

        const scaledBox = new THREE.Box3().setFromObject(cloned);
        cloned.position.y -= scaledBox.min.y;
        setLoadedScene(cloned);
      },
      undefined,
      () => {
        if (!cancelled) {
          // Graceful fallback to low-poly stylized avatar when GLB URL is unreachable
          setLoadedScene(null);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [resolvedGlbUrl]);

  const displayName = session?.displayName ?? 'Guest Explorer';
  const handle = session?.handle ?? 'guest · sign in with Wolin';

  return (
    <group {...groupProps}>
      {loadedScene ? (
        <group>
          <primitive object={loadedScene} />
          <Html position={[0, 2.25, 0]} center distanceFactor={9} zIndexRange={[20, 0]}>
            <div className="wolin-avatar-tag">
              <span className="wolin-avatar-dot" data-guest="false" />
              <div>
                <div className="wolin-avatar-name">{displayName}</div>
                <div className="wolin-avatar-handle">{handle} · GLB</div>
              </div>
            </div>
          </Html>
        </group>
      ) : (
        <StylizedLowPolyAvatar
          displayName={displayName}
          handle={handle}
          passportTheme={session?.passportTheme}
          isGuest={!session}
        />
      )}
    </group>
  );
}

/**
 * Easy-UX 2D Overlay Card for Passwordless Wolin Login & Avatar Switching.
 * Zero protocol jargon (no DPoP/JWK/RDF/ETag terms shown to end users).
 */
export function WolinAuthPanel(): ReactElement {
  const {
    session,
    isLoading,
    statusMessage,
    loginWithWolin,
    loginSandboxPreset,
    setCustomAvatarGlbUrl,
    logout,
  } = useWolinAuth();
  const [glbDraft, setGlbDraft] = useState<string>('');

  return (
    <section className="hud-card" aria-label="Wolin Passport Sign-In">
      <div className="hud-card-header">
        <span className="hud-badge">Block 01 · Identity & Avatar</span>
        {session && (
          <button type="button" className="hud-link-btn" onClick={logout}>
            Sign out
          </button>
        )}
      </div>

      {session ? (
        <div className="hud-stack">
          <div className="passport-pill">
            <div className="passport-avatar-monogram">
              {session.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="passport-meta">
              <strong>{session.displayName}</strong>
              <span>{session.handle}</span>
            </div>
          </div>

          <div className="preset-row" role="group" aria-label="Switch Sandbox Passport">
            {SANDBOX_PASSPORT_PRESETS.map((preset) => {
              const active = session.handle === `${preset.handle}.wolin.id`;
              return (
                <button
                  key={preset.handle}
                  type="button"
                  className={`chip-btn ${active ? 'active' : ''}`}
                  onClick={() => void loginSandboxPreset(preset)}
                >
                  {preset.handle}
                </button>
              );
            })}
          </div>

          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              setCustomAvatarGlbUrl(glbDraft);
            }}
          >
            <input
              type="url"
              value={glbDraft}
              onChange={(e) => setGlbDraft(e.target.value)}
              placeholder="Paste .glb avatar URL (or leave empty)"
              aria-label="Custom 3D Avatar GLB URL"
            />
            <button type="submit" className="secondary-btn">
              Apply
            </button>
          </form>

          <button
            type="button"
            className="primary-btn"
            disabled={isLoading}
            onClick={() => void loginWithWolin()}
          >
            {isLoading ? 'Connecting...' : 'Connect Live Wolin Passport'}
          </button>
        </div>
      ) : (
        <div className="hud-stack">
          <p className="hud-copy">
            Bring your avatar and world pass across every connected space in one click.
          </p>
          <button
            type="button"
            className="primary-btn"
            disabled={isLoading}
            onClick={() => void loginWithWolin()}
          >
            {isLoading ? 'Connecting...' : 'Continue with Wolin'}
          </button>
          <button
            type="button"
            className="secondary-btn"
            disabled={isLoading}
            onClick={() => void loginSandboxPreset(SANDBOX_PASSPORT_PRESETS[0]!)}
          >
            Try Instant Demo Passport
          </button>
        </div>
      )}

      {statusMessage && <p className="hud-status">{statusMessage}</p>}
    </section>
  );
}
