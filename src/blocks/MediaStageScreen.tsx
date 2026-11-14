import { Html } from '@react-three/drei';
import { type ThreeElements, useFrame } from '@react-three/fiber';
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

export type StageMediaPlatform = 'youtube' | 'chzzk' | 'unsupported';

export interface StageMediaDescriptor {
  platform: StageMediaPlatform;
  embedUrl: string | null;
  watchUrl: string | null;
  channelOrVideoId: string | null;
  label: string;
}

const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{6,20}$/;
const CHZZK_CHANNEL_PATTERN = /^[a-zA-Z0-9_-]{6,64}$/;

/**
 * Parse a YouTube Live/Video URL or CHZZK (치지직) Live URL into a sanitized HTTPS embed descriptor.
 * Offloads 100% of broadcast video bandwidth to external CDNs ($0 server egress).
 */
export function parseStageMediaUrl(rawUrl: string): StageMediaDescriptor {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      platform: 'unsupported',
      embedUrl: null,
      watchUrl: null,
      channelOrVideoId: null,
      label: 'No Broadcast Configured',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      platform: 'unsupported',
      embedUrl: null,
      watchUrl: null,
      channelOrVideoId: null,
      label: 'Invalid Stream URL',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      platform: 'unsupported',
      embedUrl: null,
      watchUrl: null,
      channelOrVideoId: null,
      label: 'Unsupported Protocol',
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const segments = parsed.pathname.split('/').filter(Boolean);

  // 1. YouTube (watch?v=, youtu.be/<id>, youtube.com/live/<id>, youtube.com/embed/<id>)
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    let videoId = parsed.searchParams.get('v');
    if (!videoId && (segments[0] === 'live' || segments[0] === 'embed' || segments[0] === 'shorts')) {
      videoId = segments[1] ?? null;
    }
    if (videoId && YOUTUBE_ID_PATTERN.test(videoId)) {
      return {
        platform: 'youtube',
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&rel=0&playsinline=1`,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
        channelOrVideoId: videoId,
        label: `YouTube Live · ${videoId}`,
      };
    }
  }

  if (host === 'youtu.be') {
    const videoId = segments[0] ?? null;
    if (videoId && YOUTUBE_ID_PATTERN.test(videoId)) {
      return {
        platform: 'youtube',
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&rel=0&playsinline=1`,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
        channelOrVideoId: videoId,
        label: `YouTube Live · ${videoId}`,
      };
    }
  }

  // 2. CHZZK Live (chzzk.naver.com/live/<channelId> or chzzk.naver.com/<channelId>)
  if (host === 'chzzk.naver.com' || host === 'm.chzzk.naver.com') {
    const channelId = segments[0] === 'live' ? (segments[1] ?? null) : (segments[0] ?? null);
    if (channelId && CHZZK_CHANNEL_PATTERN.test(channelId)) {
      return {
        platform: 'chzzk',
        embedUrl: `https://chzzk.naver.com/live/${channelId}`,
        watchUrl: `https://chzzk.naver.com/live/${channelId}`,
        channelOrVideoId: channelId,
        label: `CHZZK Live · ${channelId.slice(0, 8)}...`,
      };
    }
  }

  return {
    platform: 'unsupported',
    embedUrl: null,
    watchUrl: null,
    channelOrVideoId: null,
    label: 'Paste a YouTube or CHZZK Live URL',
  };
}

export type P2PVoiceMode = 'muted' | 'live-mic' | 'stub-mic';

export interface P2PVoiceState {
  voiceActive: boolean;
  mode: P2PVoiceMode;
  roomId: string;
  peerCount: number;
  iceGatheringState: string;
  toggleVoice: () => Promise<void>;
}

/**
 * Zero-cost 1:1–4p WebRTC P2P Spatial Voice Toggle Stub.
 * Uses public STUN (`stun:stun.l.google.com:19302`) and gracefully falls back to a simulated
 * voice channel when microphone hardware or permissions are unavailable.
 */
export function useP2PVoiceStub(roomId = 'plaza-stage-1'): P2PVoiceState {
  const [mode, setMode] = useState<P2PVoiceMode>('muted');
  const [iceGatheringState, setIceGatheringState] = useState<string>('closed');
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanupPeer = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    setIceGatheringState('closed');
  }, []);

  useEffect(() => cleanupPeer, [cleanupPeer]);

  const toggleVoice = useCallback(async () => {
    if (mode !== 'muted') {
      cleanupPeer();
      setMode('muted');
      return;
    }

    if (typeof RTCPeerConnection !== 'undefined') {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      peerRef.current = pc;
      pc.createDataChannel(`wolin-voice-${roomId}`);
      pc.onicegatheringstatechange = () => {
        setIceGatheringState(pc.iceGatheringState);
      };

      try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
          const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          streamRef.current = media;
          for (const track of media.getTracks()) {
            pc.addTrack(track, media);
          }
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          setMode('live-mic');
          return;
        }
      } catch {
        // Microphone denied or headless device: keep WebRTC P2P signaling channel in stub mode
      }

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
      } catch {
        // Ignore SDP stub failure
      }
      setMode('stub-mic');
      return;
    }

    setMode('stub-mic');
  }, [cleanupPeer, mode, roomId]);

  return {
    voiceActive: mode !== 'muted',
    mode,
    roomId,
    peerCount: mode === 'muted' ? 1 : 2,
    iceGatheringState,
    toggleVoice,
  };
}

export type MediaStageScreenProps = ThreeElements['group'] & {
  liveUrl: string;
  stageTitle?: string;
  roomId?: string;
  onLiveUrlChange?: (nextUrl: string) => void;
};

/**
 * Metaverse Lego Block #2: `<MediaStageScreen />`
 *
 * 3D stage frame embedding a YouTube Live or CHZZK Live broadcast with $0 server egress,
 * paired with a 1:1–4p WebRTC P2P spatial voice toggle stub.
 */
export function MediaStageScreen({
  liveUrl,
  stageTitle = 'Lunar Amphitheater · Live Stage',
  roomId = 'lunar-plaza-voice',
  onLiveUrlChange,
  ...groupProps
}: MediaStageScreenProps): ReactElement {
  const media = useMemo(() => parseStageMediaUrl(liveUrl), [liveUrl]);
  const voice = useP2PVoiceStub(roomId);
  const pulseRingRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!pulseRingRef.current) return;
    if (voice.voiceActive) {
      const s = 1 + Math.sin(clock.getElapsedTime() * 5) * 0.06;
      pulseRingRef.current.scale.set(s, s, 1);
    } else {
      pulseRingRef.current.scale.set(1, 1, 1);
    }
  });

  return (
    <group {...groupProps}>
      {/* Elevated Obsidian Stage Deck */}
      <mesh position={[0, 0.18, 0.6]} receiveShadow castShadow>
        <boxGeometry args={[7.4, 0.36, 2.8]} />
        <meshStandardMaterial color="#111827" metalness={0.65} roughness={0.35} />
      </mesh>

      {/* Left & Right Architectural Truss Pillars */}
      <mesh position={[-3.35, 2.35, 0]} castShadow>
        <boxGeometry args={[0.24, 4.4, 0.28]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[3.35, 2.35, 0]} castShadow>
        <boxGeometry args={[0.24, 4.4, 0.28]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.25} />
      </mesh>

      {/* Screen Backing Frame */}
      <mesh position={[0, 2.55, -0.06]} castShadow>
        <boxGeometry args={[6.5, 3.75, 0.14]} />
        <meshStandardMaterial color="#090d16" metalness={0.75} roughness={0.2} />
      </mesh>

      {/* Top Specular Light Bar */}
      <mesh position={[0, 4.48, 0.04]}>
        <boxGeometry args={[6.6, 0.09, 0.16]} />
        <meshStandardMaterial
          color="#e2e8f0"
          emissive={voice.voiceActive ? '#34d399' : '#38bdf8'}
          emissiveIntensity={1.1}
        />
      </mesh>

      {/* Spatial P2P Voice Proximity Zone Ring on Stage Floor */}
      <mesh ref={pulseRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.38, 1.15]}>
        <ringGeometry args={[0.85, 1.02, 36]} />
        <meshBasicMaterial
          color={voice.voiceActive ? '#34d399' : '#475569'}
          transparent
          opacity={voice.voiceActive ? 0.75 : 0.3}
        />
      </mesh>

      {/* Embedded 3D Stage Screen Overlay */}
      <Html
        transform
        position={[0, 2.55, 0.03]}
        distanceFactor={4.1}
        zIndexRange={[15, 0]}
      >
        <div className="stage-screen-shell">
          <div className="stage-screen-topbar">
            <div className="stage-title-wrap">
              <span className="stage-live-dot" data-platform={media.platform} />
              <span className="stage-title">{stageTitle}</span>
              <span className="stage-sub">{media.label}</span>
            </div>

            <div className="stage-actions">
              {onLiveUrlChange && (
                <>
                  <button
                    type="button"
                    className="stage-preset-btn"
                    onClick={() =>
                      onLiveUrlChange('https://www.youtube.com/watch?v=aqz-KE-bpKQ')
                    }
                  >
                    YouTube
                  </button>
                  <button
                    type="button"
                    className="stage-preset-btn"
                    onClick={() =>
                      onLiveUrlChange(
                        'https://chzzk.naver.com/live/bb382c2c0cc9fa7c86ab3b037fb5799c',
                      )
                    }
                  >
                    CHZZK
                  </button>
                </>
              )}
              <button
                type="button"
                className={`stage-voice-btn ${voice.voiceActive ? 'active' : ''}`}
                onClick={() => void voice.toggleVoice()}
              >
                {voice.mode === 'live-mic'
                  ? `P2P Voice ON (${voice.peerCount}p)`
                  : voice.mode === 'stub-mic'
                    ? `P2P Voice Stub (${voice.peerCount}p)`
                    : 'Join P2P Voice'}
              </button>
            </div>
          </div>

          <div className="stage-iframe-box">
            {media.embedUrl ? (
              <iframe
                src={media.embedUrl}
                title={stageTitle}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
              />
            ) : (
              <div className="stage-empty-fallback">
                <strong>Stage Ready for Broadcast</strong>
                <span>Paste any YouTube Live or CHZZK Live URL to project onto this 3D screen.</span>
              </div>
            )}
          </div>
        </div>
      </Html>
    </group>
  );
}
