import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  advanceViewabilityAccumulator,
  evaluateSpatialAdFrame,
  parseStageMediaUrl,
} from '../src/blocks';
import {
  createSandboxPassportSession,
  createSolidAuthRequest,
  decodeJwtPayload,
  generateDPoPKeyPair,
  parseWebIdProfile,
  signDPoPProof,
  WOLIN_NS,
} from '../src/wolin/client';

describe('Wolin Metaverse Starter — 4 Lego Blocks Verification', () => {
  it('Block 1: generates PKCE S256 + ES256 DPoP proofs and discovers https://wolin.id/ns#avatarGlbUrl', async () => {
    const authReq = await createSolidAuthRequest({
      authorizationEndpoint: 'https://id.wolin.id/authorize',
      clientId: 'https://world.example.com/client-id.jsonld',
      redirectUri: 'https://world.example.com/',
    });
    expect(authReq.url).toContain('code_challenge_method=S256');
    expect(authReq.codeVerifier.length).toBeGreaterThanOrEqual(43);

    const keyPair = await generateDPoPKeyPair();
    const proof = await signDPoPProof({
      keyPair,
      htm: 'GET',
      htu: 'https://luna.wolin.id/profile/card#me',
    });
    const claims = decodeJwtPayload(proof);
    expect(claims.htm).toBe('GET');
    expect(claims.htu).toBe('https://luna.wolin.id/profile/card');

    const turtle = `
      @prefix foaf: <http://xmlns.com/foaf/0.1/> .
      @prefix solid: <http://www.w3.org/ns/solid/terms#> .
      @prefix wolin: <${WOLIN_NS}> .
      <#me>
        foaf:name "Luna Explorer" ;
        solid:oidcIssuer <https://id.wolin.id> ;
        wolin:avatarGlbUrl <https://cdn.wolin.id/avatars/luna.glb> ;
        wolin:passportTheme "obsidian-cyan" .
    `;
    const profile = parseWebIdProfile(turtle, 'https://luna.wolin.id/profile/card#me');
    expect(profile.name).toBe('Luna Explorer');
    expect(profile.avatarGlbUrl).toBe('https://cdn.wolin.id/avatars/luna.glb');
    expect(profile.passportTheme).toBe('obsidian-cyan');

    const sandbox = await createSandboxPassportSession();
    expect(sandbox.session.handle).toBe('luna.wolin.id');
    expect(sandbox.session.tokenType).toBe('DPoP');
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
});
