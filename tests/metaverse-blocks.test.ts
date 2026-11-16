import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  advanceViewabilityAccumulator,
  evaluateSpatialAdFrame,
  parseStageMediaUrl,
} from '../src/blocks';
import {
  buildSanctuaryPortals,
  CANONICAL_MOON_PORTALS,
} from '../src/scene/MoonPortals';
import { createMeditationAudioController } from '../src/scene/meditationAudio';
import { createDriftingLotusLantern } from '../src/scene/WolinSanctuary';
import {
  createSandboxPassportSession,
  createSolidAuthRequest,
  DEFAULT_WOLIN_ISSUER,
  DEFAULT_WOLIN_POD_BASE_URL,
  decodeJwtPayload,
  generateDPoPKeyPair,
  isValidPodId,
  JARVIS_PASSPORT_PRESET,
  parseWebIdProfile,
  SANDBOX_PASSPORT_PRESETS,
  sanitizeHttpAssetUrl,
  signDPoPProof,
  WolinClient,
  WOLIN_NS,
} from '../src/wolin/client';

describe('Wolin Metaverse Starter — 4 Lego Blocks Verification', () => {
  it('Block 1: generates PKCE S256 + ES256 DPoP proofs, validates pod_id, follows 302 signed asset redirects safely, and discovers https://wolin.id/ns#avatarGlbUrl', async () => {
    expect(DEFAULT_WOLIN_ISSUER).toBe('https://auth.wolin.id');
    expect(DEFAULT_WOLIN_POD_BASE_URL).toBe('https://pod.wolin.id');
    expect(isValidPodId('alice')).toBe(true);
    expect(isValidPodId('luna')).toBe(true);
    expect(isValidPodId('xn--bad')).toBe(false);
    expect(isValidPodId('bad--handle')).toBe(false);
    expect(isValidPodId('auth')).toBe(false);

    const authReq = await createSolidAuthRequest({
      authorizationEndpoint: 'https://auth.wolin.id/authorize',
      clientId: 'https://world.example.com/client-id.jsonld',
      redirectUri: 'https://world.example.com/',
    });
    expect(authReq.url).toContain('code_challenge_method=S256');
    expect(authReq.codeVerifier.length).toBeGreaterThanOrEqual(43);

    const keyPair = await generateDPoPKeyPair();
    const proof = await signDPoPProof({
      keyPair,
      htm: 'GET',
      htu: 'https://alice.wolin.id/profile/card#me',
    });
    const claims = decodeJwtPayload(proof);
    expect(claims.htm).toBe('GET');
    expect(claims.htu).toBe('https://alice.wolin.id/profile/card');

    const turtle = `
      @prefix foaf: <http://xmlns.com/foaf/0.1/> .
      @prefix solid: <http://www.w3.org/ns/solid/terms#> .
      @prefix wolin: <${WOLIN_NS}> .
      <#me>
        foaf:name "Luna Explorer" ;
        solid:oidcIssuer <https://auth.wolin.id> ;
        wolin:avatarGlbUrl <https://cdn.wolin.id/avatars/luna.glb> ;
        wolin:passportTheme "obsidian-cyan" .
    `;
    const profile = parseWebIdProfile(turtle, 'https://luna.wolin.id/profile/card#me');
    expect(profile.name).toBe('Luna Explorer');
    expect(profile.primaryOidcIssuer).toBe('https://auth.wolin.id');
    expect(profile.avatarGlbUrl).toBe('https://cdn.wolin.id/avatars/luna.glb');
    expect(profile.passportTheme).toBe('obsidian-cyan');

    const sandbox = await createSandboxPassportSession();
    expect(sandbox.session.handle).toBe('luna.wolin.id');
    expect(sandbox.session.oidcIssuer).toBe('https://auth.wolin.id');
    expect(sandbox.session.tokenType).toBe('DPoP');
    expect(sanitizeHttpAssetUrl('http://insecure.example.com/avatar.glb')).toBeUndefined();
    expect(sanitizeHttpAssetUrl('https://cdn.wolin.id/avatar.glb')).toBe(
      'https://cdn.wolin.id/avatar.glb',
    );

    // Verify 302 signed asset redirect strips Authorization and DPoP headers
    let hopCount = 0;
    const podClient = new WolinClient({
      podUrl: 'https://alice.wolin.id/',
      accessToken: 'secret-tok',
      tokenType: 'DPoP',
      dpopKeyPair: keyPair,
      fetchFn: async (_input: RequestInfo | URL, init?: RequestInit) => {
        hopCount += 1;
        const h = new Headers(init?.headers);
        if (hopCount === 1) {
          expect(h.get('Authorization')).toBe('DPoP secret-tok');
          expect(h.get('DPoP')).toBeTruthy();
          return new Response(null, {
            status: 302,
            headers: {
              Location: 'https://auth.wolin.id/assets/alice/avatar.glb?exp=1893456000&sig=' + 'c'.repeat(64),
            },
          });
        }
        expect(h.get('Authorization')).toBeNull();
        expect(h.get('DPoP')).toBeNull();
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'Content-Type': 'model/gltf-binary' },
        });
      },
    });
    const glbBlob = await podClient.getBlob('/avatar.glb');
    expect(glbBlob.type).toBe('model/gltf-binary');
    expect(glbBlob.size).toBe(4);
    expect(hopCount).toBe(2);
  });

  it('Block 2: parses YouTube Live and CHZZK Live broadcast URLs safely', () => {
    const yt = parseStageMediaUrl('https://www.youtube.com/watch?v=jfKfPfyJRdk');
    expect(yt.platform).toBe('youtube');
    expect(yt.embedUrl).toBe(
      'https://www.youtube-nocookie.com/embed/jfKfPfyJRdk?autoplay=0&rel=0&playsinline=1',
    );

    const ytLive = parseStageMediaUrl('https://www.youtube.com/live/dQw4w9WgXcQ');
    expect(ytLive.platform).toBe('youtube');
    expect(ytLive.channelOrVideoId).toBe('dQw4w9WgXcQ');

    const chzzk = parseStageMediaUrl(
      'https://chzzk.naver.com/live/bb382c2c0cc9fa7c86ab3b037fb5799c',
    );
    expect(chzzk.platform).toBe('chzzk');
    expect(chzzk.embedUrl).toBe(
      'https://chzzk.naver.com/live/bb382c2c0cc9fa7c86ab3b037fb5799c',
    );

    const unsafe = parseStageMediaUrl('javascript:alert(1)');
    expect(unsafe.platform).toBe('unsupported');
    expect(unsafe.embedUrl).toBeNull();
  });

  it('Block 3: enforces Frustum + >=5% screen area + Raycast occlusion + 1.5s continuous dwell', () => {
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
    camera.position.set(0, 2, 5);
    camera.lookAt(0, 2, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const slotCenter = new THREE.Vector3(0, 2, 0);
    const slotQuat = new THREE.Quaternion(); // normal +Z facing camera at (0, 2, 5)

    // 1) Unobstructed close view (>5% screen area)
    const clearMetrics = evaluateSpatialAdFrame({
      camera,
      slotWorldCenter: slotCenter,
      slotWorldQuaternion: slotQuat,
      width: 3.6,
      height: 1.8,
      minScreenAreaRatio: 0.05,
    });
    expect(clearMetrics.inFrustum).toBe(true);
    expect(clearMetrics.facingCamera).toBe(true);
    expect(clearMetrics.occluded).toBe(false);
    expect(clearMetrics.screenAreaRatio).toBeGreaterThanOrEqual(0.05);
    expect(clearMetrics.isViewable).toBe(true);

    // 2) Occluder wall placed between camera (z=5) and billboard (z=0) at z=2.5
    const scene = new THREE.Scene();
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 0.2),
      new THREE.MeshBasicMaterial(),
    );
    wall.position.set(0, 2, 2.5);
    wall.updateMatrixWorld();
    scene.add(wall);

    const occludedMetrics = evaluateSpatialAdFrame({
      camera,
      slotWorldCenter: slotCenter,
      slotWorldQuaternion: slotQuat,
      width: 3.6,
      height: 1.8,
      occluderRoots: [scene],
      minScreenAreaRatio: 0.05,
    });
    expect(occludedMetrics.occluded).toBe(true);
    expect(occludedMetrics.isViewable).toBe(false);

    // 3) 1.5s continuous dwell timer resets on occlusion and triggers once at >=1500ms
    let state = { continuousDwellMs: 0, hasFiredImpression: false };
    for (let i = 0; i < 6; i++) {
      state = advanceViewabilityAccumulator(state, true, 200, 1500).next;
    }
    expect(state.continuousDwellMs).toBe(1200);
    expect(state.hasFiredImpression).toBe(false);

    // Single occluded frame resets continuous dwell back to 0ms
    state = advanceViewabilityAccumulator(state, false, 200, 1500).next;
    expect(state.continuousDwellMs).toBe(0);

    // Continuous 1.6s gaze fires impression once
    let triggeredCount = 0;
    for (let i = 0; i < 8; i++) {
      const step = advanceViewabilityAccumulator(state, true, 200, 1500);
      state = step.next;
      if (step.justTriggered) triggeredCount++;
    }
    expect(triggeredCount).toBe(1);
    expect(state.hasFiredImpression).toBe(true);
  });

  it('Sanctuary: boots Jarvis pioneer passport, builds 4 canonical Moon Portals, and appends sanitized Pod wolin:worldLinks', async () => {
    expect(SANDBOX_PASSPORT_PRESETS[0]?.handle).toBe('jarvis');
    const jarvis = await createSandboxPassportSession(JARVIS_PASSPORT_PRESET);
    expect(jarvis.session.webId).toBe('https://jarvis.wolin.id/profile/card#me');
    expect(jarvis.session.handle).toBe('jarvis.wolin.id');
    expect(jarvis.session.displayName).toBe('Jarvis');

    // Canonical 4 portals deduplicate Jarvis's own passport link so default count stays 4
    expect(CANONICAL_MOON_PORTALS).toHaveLength(4);
    expect(CANONICAL_MOON_PORTALS.map((p) => p.url)).toEqual([
      'https://auth.wolin.id/passport/jarvis',
      'https://topdoli.com/',
      'https://meemora.co/madang/',
      'https://zzazzbar.com/',
    ]);

    const jarvisPortals = buildSanctuaryPortals(jarvis.session.worldLinks);
    expect(jarvisPortals).toHaveLength(4);

    // Custom HTTPS wolin:worldLinks dynamically spawn Moon 05+ while filtering unsafe URLs
    const customPortals = buildSanctuaryPortals([
      'https://auth.wolin.id/passport/jarvis', // duplicate of Moon 01
      'http://insecure.world.example/', // rejected (non-HTTPS external)
      'javascript:alert(1)', // rejected
      'https://cycorld.com/sanctuary',
    ]);
    expect(customPortals).toHaveLength(5);
    expect(customPortals[4]?.code).toBe('Moon 05');
    expect(customPortals[4]?.url).toBe('https://cycorld.com/sanctuary');
    expect(customPortals[4]?.isCustomPodLink).toBe(true);
  });

  it('Sanctuary Micro-Interactions: spawns outward-drifting lotus lanterns and safe headless singing-bowl audio controller', () => {
    const lantern = createDriftingLotusLantern(4, [0, 4.2], 12.5);
    expect(lantern.id).toContain('lotus-lantern-4');
    expect(Math.hypot(lantern.driftVx, lantern.driftVz)).toBeGreaterThan(0.05);

    const audio = createMeditationAudioController();
    expect(audio.isRunning()).toBe(false);
    audio.start();
    expect(audio.isRunning()).toBe(true);
    audio.setMuted(true);
    expect(audio.isMuted()).toBe(true);
    audio.stop();
    expect(audio.isRunning()).toBe(false);
    audio.dispose();
  });
});
