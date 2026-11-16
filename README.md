# Wolin (`月印千江`) Metaverse Starter (`@wolin-id/metaverse-starter`)

> **One Identity. Infinite Reflections. (`月印千江`)** — Drop-in 3D Metaverse Starter Kit on **React 19 + Vite 6 + TypeScript 5 + Three.js (`@react-three/fiber` & `@react-three/drei`)**.

Clone and launch a sovereign 3D spatial web world in under 5 minutes with **zero API keys**, **cross-world `.glb` avatars (`https://wolin.id/ns#`)**, **$0-egress live stage streaming**, and **Zero-PII MRC 3D spatial ads**.

---

## Included 4 Metaverse Lego Blocks

| Block | Path | Capability |
| :--- | :--- | :--- |
| **1. Auth & 3D Avatar** | [`src/blocks/WolinAuthAndAvatar.tsx`](./src/blocks/WolinAuthAndAvatar.tsx) | Passwordless Wolin Solid-OIDC (`PKCE S256` + `ES256 DPoP`) sign-in, `https://wolin.id/ns#avatarGlbUrl` 3D `.glb` loader, Sandbox Passport offline mode, and stylized low-poly 3D Lunar Explorer fallback avatar. |
| **2. Live Stage & Voice** | [`src/blocks/MediaStageScreen.tsx`](./src/blocks/MediaStageScreen.tsx) | 3D amphitheater screen embedding **YouTube Live** or **CHZZK (치지직) Live** (`$0` server bandwidth) + 1:1–4p **WebRTC P2P** spatial voice toggle stub. |
| **3. Spatial AdSlot** | [`src/blocks/WolinAdSlot.tsx`](./src/blocks/WolinAdSlot.tsx) | 3D billboard with `useSpatialAdViewability` hook (**Frustum** + **`>= 5%` screen area** + **Raycast occlusion check** + **`1.5s` continuous gaze timer**) + placeholder Wolin Passport house ad. |
| **4. Client ID Document** | [`public/client-id.jsonld`](./public/client-id.jsonld) | W3C Solid-OIDC Client ID Document template enabling instant, review-free Wolin login on any HTTPS domain. |

Self-contained Wolin SDK primitives live in [`src/wolin/client.ts`](./src/wolin/client.ts) (aliased to `@wolin-id/client` so `npm install && npm run build` works 100% standalone and offline).

---

## Quick Start

```bash
git clone https://github.com/wolin-id/metaverse-starter.git
cd metaverse-starter
npm install
npm run dev
```

Verify type safety, unit tests, and production bundle:

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run build       # tsc --noEmit && vite build
```

---

## Deploying to Your Own Domain

1. Edit [`public/client-id.jsonld`](./public/client-id.jsonld) and replace `https://world.example.com` with your production HTTPS origin:
   ```json
   {
     "@context": ["https://www.w3.org/ns/solid/oidc-context.jsonld"],
     "client_id": "https://your-world.com/client-id.jsonld",
     "client_name": "Your 3D World",
     "redirect_uris": ["https://your-world.com/"],
     "scope": "openid webid offline_access",
     "grant_types": ["authorization_code", "refresh_token"],
     "response_types": ["code"],
     "token_endpoint_auth_method": "none",
     "dpop_bound_access_tokens": true
   }
   ```
2. Deploy `dist/` to Cloudflare Pages, Vercel, Netlify, or any static CDN. Wolin verifies that `client_id` and `redirect_uri` share the same HTTPS origin — no developer portal registration or client secrets needed.

---

## AI Coding Agent Support

- Companion skill & agent reference repository: [`wolin-id/skills`](https://github.com/wolin-id/skills) (`SKILL.md`, `references/ns-schema.md`, `references/lego-blocks.md`).

---

## License

Dual-licensed under either of:

- **MIT License** ([`LICENSE-MIT`](./LICENSE-MIT))
- **Apache License, Version 2.0** ([`LICENSE-APACHE`](./LICENSE-APACHE))

at your option. Copyright (c) 2026 Entropy Paradox, Inc. and Wolin Contributors.
