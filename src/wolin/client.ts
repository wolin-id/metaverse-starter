/**
 * Self-contained Wolin (月印千江) Sovereign Pod & Metaverse Client (`@wolin-id/client`-compatible).
 *
 * Implements:
 * - RFC 7636 PKCE (`S256`) & Solid-OIDC Discovery + Authorization Code Exchange (`https://auth.wolin.id`)
 * - RFC 9449 ES256 (`P-256`) DPoP Keypair Generation, JWK Thumbprint (`jkt`), Proof Signing & Nonce Retry
 * - W3C WebID Turtle Profile Parsing + Official `https://wolin.id/ns#` Metaverse Vocabulary Discovery
 * - Tenant `pod_id` Handle Validation (`isValidPodId`, `validatePodId`)
 * - Authenticated `WolinPodClient` (`WolinClient`) with credential-safe `302` signed asset redirect handling
 * - Offline-capable Sandbox Passport helper for zero-config local 3D world prototyping
 */

export const WOLIN_NS = 'https://wolin.id/ns#';
export const WOLIN_AVATAR_GLB_URL_IRI = 'https://wolin.id/ns#avatarGlbUrl';
export const WOLIN_AVATAR_VRM_URL_IRI = 'https://wolin.id/ns#avatarVrmUrl';
export const WOLIN_PASSPORT_THEME_IRI = 'https://wolin.id/ns#passportTheme';
export const WOLIN_WORLD_LINKS_IRI = 'https://wolin.id/ns#worldLinks';
export const WOLIN_WEARABLE_ITEM_IRI = 'https://wolin.id/ns#wearableItem';

export const SOLID_OIDC_ISSUER_IRI = 'http://www.w3.org/ns/solid/terms#oidcIssuer';
export const PIM_STORAGE_IRI = 'http://www.w3.org/ns/pim/space#storage';
export const LDP_INBOX_IRI = 'http://www.w3.org/ns/ldp#inbox';
export const FOAF_NAME_IRI = 'http://xmlns.com/foaf/0.1/name';
export const VCARD_FN_IRI = 'http://www.w3.org/2006/vcard/ns#fn';
export const RDF_TYPE_IRI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

export const DEFAULT_WOLIN_OIDC_ISSUER = 'https://auth.wolin.id';
export const DEFAULT_WOLIN_ISSUER = DEFAULT_WOLIN_OIDC_ISSUER;
export const DEFAULT_WOLIN_POD_BASE_URL = 'https://pod.wolin.id';
export const DEFAULT_WOLIN_DOMAIN = 'wolin.id';
export const DEFAULT_SOLID_OIDC_SCOPES = ['openid', 'webid', 'offline_access'] as const;

export const MIN_POD_ID_LEN = 3;
export const MAX_POD_ID_LEN = 32;
export const RESERVED_POD_ID_LIST = [
  'abuse', 'admin', 'administrator', 'ads', 'api', 'app', 'apps', 'assets', 'auth', 'authorize',
  'autoconfig', 'autodiscover', 'backup', 'beta', 'billing', 'blog', 'calendar', 'cdn', 'chat',
  'cloud', 'consent', 'console', 'contact', 'control', 'corp', 'dashboard', 'data', 'dev', 'dns',
  'doc', 'docs', 'download', 'downloads', 'edge', 'email', 'engine', 'enterprise', 'entropy',
  'events', 'files', 'forum', 'ftp', 'gateway', 'git', 'graphql', 'health', 'healthz', 'help',
  'home', 'host', 'hostmaster', 'id', 'idp', 'images', 'imap', 'img', 'inbox', 'info', 'internal',
  'jwks', 'legal', 'local', 'localhost', 'login', 'logout', 'logs', 'mail', 'mailer', 'manage',
  'mcp', 'media', 'metrics', 'mta-sts', 'mx', 'net', 'news', 'no-reply', 'noreply', 'notify',
  'ns', 'ns1', 'ns2', 'ns3', 'ns4', 'oauth', 'official', 'oidc', 'ops', 'org', 'origin',
  'passport', 'pay', 'payment', 'payments', 'pod', 'pods', 'pop', 'pop3', 'portal', 'postmaster',
  'press', 'pricing', 'private', 'prod', 'production', 'profile', 'proxy', 'pub', 'public',
  'register', 'registry', 'relay', 'root', 'rpc', 'rss', 'sandbox', 'search', 'secure',
  'security', 'server', 'service', 'services', 'session', 'settings', 'sftp', 'signin',
  'signout', 'signup', 'smtp', 'solid', 'sparql', 'ssh', 'sso', 'stage', 'staging', 'static',
  'stats', 'status', 'storage', 'store', 'support', 'sync', 'sys', 'system', 'team', 'telemetry',
  'terms', 'test', 'testing', 'token', 'trust', 'updates', 'upload', 'uploads', 'userinfo',
  'vault', 'verify', 'vpn', 'wac', 'web', 'webhook', 'webhooks', 'webid', 'webmail', 'webmaster',
  'well-known', 'wolin', 'ws', 'wss', 'www',
] as const;
export const RESERVED_POD_IDS: ReadonlySet<string> = new Set(RESERVED_POD_ID_LIST);

export function isReservedPodId(podId: string): boolean {
  return typeof podId === 'string' && RESERVED_POD_IDS.has(podId);
}

export function isValidPodId(podId: string, options?: { allowReserved?: boolean }): boolean {
  if (typeof podId !== 'string') return false;
  if (podId.length < MIN_POD_ID_LEN || podId.length > MAX_POD_ID_LEN) return false;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(podId)) return false;
  if (podId.startsWith('xn--') || podId.includes('--')) return false;
  if (!options?.allowReserved && RESERVED_POD_IDS.has(podId)) return false;
  return true;
}

export class WolinError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WolinError';
    this.code = code;
  }
}

export class WolinAuthError extends WolinError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('WOLIN_AUTH_ERROR', message, options);
    this.name = 'WolinAuthError';
  }
}

export class WolinParseError extends WolinError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('WOLIN_PARSE_ERROR', message, options);
    this.name = 'WolinParseError';
  }
}

export interface DPoPPublicJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

export interface DPoPKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: DPoPPublicJwk;
  jkt: string;
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export interface OidcProviderMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri?: string;
  end_session_endpoint?: string;
  dpop_signing_alg_values_supported?: string[];
  code_challenge_methods_supported?: string[];
  scopes_supported?: string[];
}

export interface SolidAuthRequest {
  url: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  clientId: string;
  redirectUri: string;
}

export interface SolidTokenSet {
  accessToken: string;
  tokenType: 'DPoP' | 'Bearer';
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: number;
  scope?: string;
  webId?: string;
  dpopNonce?: string;
}

export interface RdfTriple {
  subject: string;
  predicate: string;
  object: string;
  objectType: 'iri' | 'literal';
}

export interface WebIdProfile {
  webId: string;
  name?: string;
  oidcIssuers: string[];
  storages: string[];
  inboxes: string[];
  primaryOidcIssuer?: string;
  primaryStorage?: string;
  avatarGlbUrl?: string;
  avatarVrmUrl?: string;
  passportTheme?: string;
  worldLinks: string[];
  wearableItems: string[];
  triples: RdfTriple[];
}

export interface WolinSession {
  webId: string;
  handle: string;
  displayName: string;
  accessToken: string;
  tokenType: 'DPoP' | 'Bearer';
  dpopKeyPair?: DPoPKeyPair;
  podUrl?: string;
  oidcIssuer: string;
  avatarGlbUrl?: string;
  avatarVrmUrl?: string;
  passportTheme?: string;
  worldLinks: string[];
  wearableItems: string[];
  isSandbox?: boolean;
}

function getWebCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new WolinAuthError('Web Crypto API (crypto.subtle) is required for Solid-OIDC PKCE + DPoP');
  }
  return globalThis.crypto;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlEncodeString(text: string): string {
  return base64UrlEncode(new TextEncoder().encode(text));
}

export function base64UrlDecode(b64url: string): Uint8Array {
  const normalized = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const binary = atob(normalized + '='.repeat(padLen));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function base64UrlDecodeString(b64url: string): string {
  return new TextDecoder().decode(base64UrlDecode(b64url));
}

export async function sha256Base64Url(input: string): Promise<string> {
  const digest = await getWebCrypto().subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64UrlEncode(new Uint8Array(digest));
}

export function generateRandomState(byteLength = 24): string {
  const buf = new Uint8Array(byteLength);
  getWebCrypto().getRandomValues(buf);
  return base64UrlEncode(buf);
}

export async function generatePkcePair(byteLength = 32): Promise<PkcePair> {
  const randomBytes = new Uint8Array(byteLength);
  getWebCrypto().getRandomValues(randomBytes);
  const codeVerifier = base64UrlEncode(randomBytes);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

export async function computeJwkThumbprint(jwk: DPoPPublicJwk): Promise<string> {
  const canonicalJson = `{"crv":${JSON.stringify(jwk.crv)},"kty":"EC","x":${JSON.stringify(
    jwk.x,
  )},"y":${JSON.stringify(jwk.y)}}`;
  return sha256Base64Url(canonicalJson);
}

export async function generateDPoPKeyPair(extractable = false): Promise<DPoPKeyPair> {
  const cryptoObj = getWebCrypto();
  const generated = await cryptoObj.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    extractable,
    ['sign', 'verify'],
  );
  const exported = await cryptoObj.subtle.exportKey('jwk', generated.publicKey);
  if (!exported.x || !exported.y) {
    throw new WolinAuthError('Failed to export ES256 DPoP public JWK coordinates');
  }
  const publicJwk: DPoPPublicJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: exported.x,
    y: exported.y,
  };
  const jkt = await computeJwkThumbprint(publicJwk);
  return {
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
    publicJwk,
    jkt,
  };
}

export function normalizeHtu(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    throw new WolinAuthError(`Malformed DPoP htu URI '${rawUrl}'`, { cause: err });
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new WolinAuthError(`DPoP htu requires http or https scheme (got '${parsed.protocol}')`);
  }
  if (parsed.username || parsed.password) {
    throw new WolinAuthError('Userinfo credentials are forbidden in DPoP htu URIs');
  }
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

export interface SignDPoPProofOptions {
  keyPair: DPoPKeyPair;
  htm: string;
  htu: string;
  accessToken?: string;
  nonce?: string;
  iat?: number;
  jti?: string;
}

export async function signDPoPProof(options: SignDPoPProofOptions): Promise<string> {
  const cryptoObj = getWebCrypto();
  const htm = options.htm.trim().toUpperCase();
  const htu = normalizeHtu(options.htu);
  const jti = options.jti ?? cryptoObj.randomUUID();
  const iat = options.iat ?? Math.floor(Date.now() / 1000);

  const header = {
    typ: 'dpop+jwt',
    alg: 'ES256',
    jwk: options.keyPair.publicJwk,
  };

  const payload: Record<string, unknown> = {
    jti,
    htm,
    htu,
    iat,
  };
  if (options.accessToken) {
    payload.ath = await sha256Base64Url(options.accessToken);
  }
  if (options.nonce) {
    payload.nonce = options.nonce;
  }

  const headerB64 = base64UrlEncodeString(JSON.stringify(header));
  const payloadB64 = base64UrlEncodeString(JSON.stringify(payload));
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = await cryptoObj.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    options.keyPair.privateKey,
    signingInput,
  );
  return `${headerB64}.${payloadB64}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3 || !parts[1]) {
    throw new WolinAuthError('Invalid compact JWT format');
  }
  const parsed = JSON.parse(base64UrlDecodeString(parts[1])) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new WolinAuthError('JWT payload must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

export async function discoverOidcProvider(
  issuerUrl: string,
  fetchFn: typeof fetch = (input, init) => globalThis.fetch(input, init),
): Promise<OidcProviderMetadata> {
  const base = issuerUrl.trim().replace(/\/+$/, '');
  const discoveryUrl = `${base}/.well-known/openid-configuration`;
  const response = await fetchFn(discoveryUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new WolinAuthError(`OIDC discovery failed with HTTP ${response.status} at ${discoveryUrl}`);
  }
  const metadata = (await response.json()) as OidcProviderMetadata;
  if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
    throw new WolinAuthError('OIDC discovery missing authorization_endpoint or token_endpoint');
  }
  return metadata;
}

export interface CreateSolidAuthRequestOptions {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scopes?: readonly string[];
  state?: string;
  prompt?: string;
}

export async function createSolidAuthRequest(
  options: CreateSolidAuthRequestOptions,
): Promise<SolidAuthRequest> {
  const pkce = await generatePkcePair(32);
  const state = options.state ?? generateRandomState(24);
  const authUrl = new URL(options.authorizationEndpoint);
  const scopes =
    options.scopes && options.scopes.length > 0 ? options.scopes : DEFAULT_SOLID_OIDC_SCOPES;

  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', options.clientId.trim());
  authUrl.searchParams.set('redirect_uri', options.redirectUri.trim());
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('code_challenge', pkce.codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  if (options.prompt) {
    authUrl.searchParams.set('prompt', options.prompt);
  }

  return {
    url: authUrl.toString(),
    state,
    codeVerifier: pkce.codeVerifier,
    codeChallenge: pkce.codeChallenge,
    clientId: options.clientId.trim(),
    redirectUri: options.redirectUri.trim(),
  };
}

export interface ExchangeCodeOptions {
  tokenEndpoint: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  dpopKeyPair: DPoPKeyPair;
  fetchFn?: typeof fetch;
}

export async function exchangeCodeForTokens(options: ExchangeCodeOptions): Promise<SolidTokenSet> {
  const fetchImpl = options.fetchFn ?? ((input, init) => globalThis.fetch(input, init));
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: options.code.trim(),
    redirect_uri: options.redirectUri.trim(),
    client_id: options.clientId.trim(),
    code_verifier: options.codeVerifier.trim(),
  });

  const sendWithNonce = async (nonce?: string): Promise<Response> => {
    const proof = await signDPoPProof({
      keyPair: options.dpopKeyPair,
      htm: 'POST',
      htu: options.tokenEndpoint,
      nonce,
    });
    return fetchImpl(options.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        DPoP: proof,
      },
      body: body.toString(),
    });
  };

  let response = await sendWithNonce();
  if (response.status === 400 || response.status === 401) {
    const serverNonce = response.headers.get('DPoP-Nonce');
    if (serverNonce) {
      response = await sendWithNonce(serverNonce);
    }
  }

  if (!response.ok) {
    throw new WolinAuthError(`Solid-OIDC token exchange failed with HTTP ${response.status}`);
  }

  const raw = (await response.json()) as Record<string, unknown>;
  if (typeof raw.access_token !== 'string' || !raw.access_token) {
    throw new WolinAuthError('Token response missing access_token');
  }

  const idToken = typeof raw.id_token === 'string' ? raw.id_token : undefined;
  let webId: string | undefined;
  for (const candidate of [idToken, raw.access_token]) {
    if (!candidate || candidate.split('.').length !== 3) continue;
    try {
      const claims = decodeJwtPayload(candidate);
      if (typeof claims.webid === 'string' && claims.webid.trim()) {
        webId = claims.webid.trim();
        break;
      }
      if (typeof claims.sub === 'string' && /^https?:\/\//i.test(claims.sub)) {
        webId = claims.sub.trim();
        break;
      }
    } catch {
      // Ignore opaque access token
    }
  }

  const expiresIn = typeof raw.expires_in === 'number' ? raw.expires_in : undefined;
  return {
    accessToken: raw.access_token,
    tokenType:
      typeof raw.token_type === 'string' && raw.token_type.toLowerCase() === 'bearer'
        ? 'Bearer'
        : 'DPoP',
    idToken,
    refreshToken: typeof raw.refresh_token === 'string' ? raw.refresh_token : undefined,
    expiresIn,
    expiresAt: expiresIn !== undefined ? Date.now() + expiresIn * 1000 : undefined,
    scope: typeof raw.scope === 'string' ? raw.scope : undefined,
    webId,
    dpopNonce: response.headers.get('DPoP-Nonce') ?? undefined,
  };
}

function unescapeLiteral(raw: string): string {
  return raw
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

/**
 * Lightweight W3C Turtle parser supporting `@prefix`, `PREFIX`, relative `<#me>` IRIs,
 * `;` predicate lists, `,` object lists, and the `https://wolin.id/ns#` vocabulary.
 */
export function parseTurtle(turtle: string, baseIri: string): RdfTriple[] {
  const prefixes = new Map<string, string>();
  let base = baseIri;

  const cleanLines = turtle
    .split(/\r?\n/)
    .map((line) => {
      let inQuotes = false;
      let quoteChar = '';
      let inIri = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (!inQuotes && ch === '<') inIri = true;
        else if (!inQuotes && ch === '>') inIri = false;
        else if (!inIri && (ch === '"' || ch === "'") && line[i - 1] !== '\\') {
          if (!inQuotes) {
            inQuotes = true;
            quoteChar = ch;
          } else if (quoteChar === ch) {
            inQuotes = false;
          }
        } else if (!inQuotes && !inIri && ch === '#') {
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join('\n');

  const prefixRegex = /(?:@prefix|PREFIX)\s+([a-zA-Z0-9_-]*):\s*<([^>]+)>\s*\.?/gi;
  const withoutDirectives = cleanLines
    .replace(/@base\s+<([^>]+)>\s*\./gi, (_m, iri: string) => {
      base = new URL(iri, base).toString();
      return '';
    })
    .replace(prefixRegex, (_m, pfx: string, ns: string) => {
      prefixes.set(pfx, new URL(ns, base).toString());
      return '';
    });

  const resolveTerm = (rawTerm: string): { value: string; type: 'iri' | 'literal' } | null => {
    const trimmed = rawTerm.trim();
    if (!trimmed) return null;
    if (trimmed === 'a') {
      return { value: RDF_TYPE_IRI, type: 'iri' };
    }
    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      const inner = trimmed.slice(1, -1);
      if (inner === '') {
        const u = new URL(base);
        u.hash = '';
        return { value: u.toString(), type: 'iri' };
      }
      if (/^https?:\/\//i.test(inner)) {
        const abs = new URL(inner);
        const afterScheme = inner.replace(/^https?:\/\//i, '');
        const authorityAndRest = afterScheme.split(/[?#]/)[0] ?? '';
        if (!authorityAndRest.includes('/')) {
          return { value: `${abs.protocol}//${abs.host}${abs.search}${abs.hash}`, type: 'iri' };
        }
        return { value: abs.toString(), type: 'iri' };
      }
      return { value: new URL(inner, base).toString(), type: 'iri' };
    }
    if (
      (trimmed.startsWith('"') && trimmed.includes('"')) ||
      (trimmed.startsWith("'") && trimmed.includes("'"))
    ) {
      const quote = trimmed[0]!;
      let endIdx = 1;
      while (endIdx < trimmed.length) {
        if (trimmed[endIdx] === quote && trimmed[endIdx - 1] !== '\\') break;
        endIdx++;
      }
      return { value: unescapeLiteral(trimmed.slice(1, endIdx)), type: 'literal' };
    }
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx !== -1) {
      const pfx = trimmed.slice(0, colonIdx);
      const local = trimmed.slice(colonIdx + 1);
      const ns = prefixes.get(pfx);
      if (ns !== undefined) {
        return { value: `${ns}${local}`, type: 'iri' };
      }
    }
    return { value: trimmed, type: 'literal' };
  };

  const splitTopLevel = (text: string, delimiter: string): string[] => {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let inIri = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      if (!inQuotes && ch === '<') inIri = true;
      else if (!inQuotes && ch === '>') inIri = false;
      else if (!inIri && (ch === '"' || ch === "'") && text[i - 1] !== '\\') {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = ch;
        } else if (quoteChar === ch) {
          inQuotes = false;
        }
      }

      if (!inQuotes && !inIri && ch === delimiter) {
        if (delimiter === '.') {
          const prev = text[i - 1];
          const next = text[i + 1];
          if (prev && /[0-9]/.test(prev) && next && /[0-9]/.test(next)) {
            current += ch;
            continue;
          }
        }
        if (current.trim()) parts.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  };

  const triples: RdfTriple[] = [];
  for (const statement of splitTopLevel(withoutDirectives, '.')) {
    const firstSpaceMatch = statement.match(/^(<[^>]+>|[a-zA-Z0-9_-]*:[a-zA-Z0-9_#-]*)\s+([\s\S]+)$/);
    if (!firstSpaceMatch) continue;
    const subjResolved = resolveTerm(firstSpaceMatch[1]!);
    if (!subjResolved || subjResolved.type !== 'iri') continue;

    const predObjBlocks = splitTopLevel(firstSpaceMatch[2]!, ';');
    for (const block of predObjBlocks) {
      const predMatch = block.match(/^(a|<[^>]+>|[a-zA-Z0-9_-]*:[a-zA-Z0-9_#-]*)\s+([\s\S]+)$/);
      if (!predMatch) continue;
      const predResolved = resolveTerm(predMatch[1]!);
      if (!predResolved || predResolved.type !== 'iri') continue;

      for (const objRaw of splitTopLevel(predMatch[2]!, ',')) {
        const objResolved = resolveTerm(objRaw);
        if (!objResolved) continue;
        triples.push({
          subject: subjResolved.value,
          predicate: predResolved.value,
          object: objResolved.value,
          objectType: objResolved.type,
        });
      }
    }
  }
  return triples;
}

export function parseWebIdProfile(
  turtle: string,
  webId: string,
  documentIri?: string,
): WebIdProfile {
  const trimmedWebId = webId.trim();
  if (!trimmedWebId) {
    throw new WolinParseError('webId must not be empty');
  }
  const docUrl = new URL(documentIri ?? trimmedWebId);
  docUrl.hash = '';
  const canonicalBase = docUrl.toString();
  const canonicalWebId = new URL(trimmedWebId, canonicalBase).toString();
  const triples = parseTurtle(turtle, canonicalBase);

  const oidcIssuers: string[] = [];
  const storages: string[] = [];
  const inboxes: string[] = [];
  const worldLinks: string[] = [];
  const wearableItems: string[] = [];
  let foafName: string | undefined;
  let vcardFn: string | undefined;
  let avatarGlbUrl: string | undefined;
  let avatarVrmUrl: string | undefined;
  let passportTheme: string | undefined;

  for (const t of triples) {
    if (t.subject !== canonicalWebId) continue;

    if (t.predicate === SOLID_OIDC_ISSUER_IRI && t.objectType === 'iri') {
      if (!oidcIssuers.includes(t.object)) oidcIssuers.push(t.object);
    } else if (t.predicate === PIM_STORAGE_IRI && t.objectType === 'iri') {
      if (!storages.includes(t.object)) storages.push(t.object);
    } else if (t.predicate === LDP_INBOX_IRI && t.objectType === 'iri') {
      if (!inboxes.includes(t.object)) inboxes.push(t.object);
    } else if (t.predicate === FOAF_NAME_IRI && foafName === undefined) {
      foafName = t.object;
    } else if (t.predicate === VCARD_FN_IRI && vcardFn === undefined) {
      vcardFn = t.object;
    } else if (t.predicate === WOLIN_AVATAR_GLB_URL_IRI && avatarGlbUrl === undefined) {
      avatarGlbUrl = sanitizeHttpAssetUrl(t.object);
    } else if (t.predicate === WOLIN_AVATAR_VRM_URL_IRI && avatarVrmUrl === undefined) {
      avatarVrmUrl = sanitizeHttpAssetUrl(t.object);
    } else if (t.predicate === WOLIN_PASSPORT_THEME_IRI && passportTheme === undefined) {
      passportTheme = t.object;
    } else if (t.predicate === WOLIN_WORLD_LINKS_IRI) {
      const cleanLink = sanitizeHttpAssetUrl(t.object);
      if (cleanLink && !worldLinks.includes(cleanLink)) worldLinks.push(cleanLink);
    } else if (t.predicate === WOLIN_WEARABLE_ITEM_IRI) {
      if (!wearableItems.includes(t.object)) wearableItems.push(t.object);
    }
  }

  return {
    webId: canonicalWebId,
    name: foafName ?? vcardFn,
    oidcIssuers,
    storages,
    inboxes,
    primaryOidcIssuer: oidcIssuers[0],
    primaryStorage: storages[0],
    avatarGlbUrl,
    avatarVrmUrl,
    passportTheme,
    worldLinks,
    wearableItems,
    triples,
  };
}

export function sanitizeHttpAssetUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw.trim());
    const isLocalHttp =
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    if (parsed.protocol !== 'https:' && !isLocalHttp) return undefined;
    if (parsed.username || parsed.password) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export async function fetchWebIdProfile(
  webId: string,
  options?: { fetchFn?: typeof fetch },
): Promise<WebIdProfile> {
  const parsed = new URL(webId.trim());
  parsed.hash = '';
  const docIri = parsed.toString();
  const fetchImpl = options?.fetchFn ?? ((input, init) => globalThis.fetch(input, init));

  const response = await fetchImpl(docIri, {
    method: 'GET',
    headers: { Accept: 'text/turtle, application/n-triples;q=0.8' },
  });
  if (!response.ok) {
    throw new WolinAuthError(`Failed to dereference WebID '${docIri}': HTTP ${response.status}`);
  }
  const turtle = await response.text();
  return parseWebIdProfile(turtle, webId, response.url || docIri);
}

export function verifyWebIdOidcIssuer(profile: WebIdProfile, expectedIssuer: string): void {
  const expected = expectedIssuer.trim().replace(/\/+$/, '');
  const matched = profile.oidcIssuers.some((iss) => iss.trim().replace(/\/+$/, '') === expected);
  if (!matched) {
    throw new WolinAuthError(
      `WebID '${profile.webId}' does not authorize Solid-OIDC issuer '${expectedIssuer}'`,
    );
  }
}

export function extractHandleFromWebId(webId: string): string {
  try {
    const u = new URL(webId);
    if (u.hostname.endsWith('.wolin.id')) {
      return u.hostname.slice(0, -'.wolin.id'.length);
    }
    return u.hostname;
  } catch {
    return 'explorer';
  }
}

export interface WolinPodClientOptions {
  podUrl?: string;
  webId?: string;
  accessToken?: string;
  tokenType?: 'DPoP' | 'Bearer';
  dpopKeyPair?: DPoPKeyPair;
  fetchFn?: typeof fetch;
}

export class WolinPodClient {
  private readonly options: WolinPodClientOptions;

  constructor(options: WolinPodClientOptions = {}) {
    this.options = options;
  }

  private resolveUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    if (!this.options.podUrl) {
      throw new WolinAuthError('podUrl is required when requesting a relative Pod path');
    }
    const base = this.options.podUrl.endsWith('/')
      ? this.options.podUrl
      : `${this.options.podUrl}/`;
    return new URL(pathOrUrl.replace(/^\/+/, ''), base).toString();
  }

  async fetchAuthenticated(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
    const targetUrl = this.resolveUrl(pathOrUrl);
    const initialParsed = new URL(targetUrl);
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const fetchImpl = this.options.fetchFn ?? ((input, reqInit) => globalThis.fetch(input, reqInit));
    const canFollowSafely =
      (init.redirect ?? 'follow') === 'follow' && (method === 'GET' || method === 'HEAD');

    if (this.options.accessToken) {
      if (this.options.tokenType === 'DPoP' && this.options.dpopKeyPair) {
        headers.set('Authorization', `DPoP ${this.options.accessToken}`);
        headers.set(
          'DPoP',
          await signDPoPProof({
            keyPair: this.options.dpopKeyPair,
            htm: method,
            htu: targetUrl,
            accessToken: this.options.accessToken,
          }),
        );
      } else {
        headers.set('Authorization', `Bearer ${this.options.accessToken}`);
      }
    }

    let response = await fetchImpl(targetUrl, {
      ...init,
      method,
      headers,
      redirect: canFollowSafely && this.options.accessToken ? 'manual' : init.redirect,
    });

    if (canFollowSafely && response.type === 'opaqueredirect') {
      return fetchImpl(targetUrl, { ...init, method, headers, redirect: 'follow' });
    }

    let currentUrl = initialParsed;
    let hops = 0;
    while (canFollowSafely && [301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('Location');
      if (!location || hops >= 5) break;
      await response.body?.cancel().catch(() => undefined);
      const nextUrl = new URL(location, currentUrl);
      if (currentUrl.protocol === 'https:' && nextUrl.protocol !== 'https:') {
        throw new WolinAuthError('HTTPS Pod request must not downgrade to HTTP via redirect');
      }
      const hopHeaders = new Headers(init.headers);
      hopHeaders.delete('Authorization');
      hopHeaders.delete('DPoP');
      hopHeaders.delete('Cookie');
      response = await fetchImpl(nextUrl.toString(), {
        ...init,
        method: response.status === 303 && method !== 'HEAD' ? 'GET' : method,
        headers: hopHeaders,
        body: undefined,
        redirect: 'manual',
      });
      currentUrl = nextUrl;
      hops += 1;
    }

    return response;
  }

  async get(pathOrUrl: string, init: RequestInit = {}): Promise<Uint8Array> {
    const response = await this.fetchAuthenticated(pathOrUrl, { ...init, method: 'GET' });
    if (!response.ok) {
      throw new WolinError('HTTP_ERROR', `Pod GET failed with HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async getBlob(pathOrUrl: string, init: RequestInit = {}): Promise<Blob> {
    const response = await this.fetchAuthenticated(pathOrUrl, { ...init, method: 'GET' });
    if (!response.ok) {
      throw new WolinError('HTTP_ERROR', `Pod GET failed with HTTP ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get('Content-Type')?.split(';')[0]?.trim();
    return new Blob([bytes as BlobPart], { type: contentType || 'application/octet-stream' });
  }
}

export { WolinPodClient as WolinClient };

/**
 * Resolve the origin-bound Solid-OIDC Client ID Document URL (`<origin>/client-id.jsonld`).
 * Matches `wolin-id/cloud` security rule: `clientUrl.origin === redirectUrl.origin`.
 */
export function resolveOriginClientId(origin?: string): { clientId: string; redirectUri: string } {
  const resolvedOrigin =
    origin ??
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://world.example.com');
  const cleanOrigin = resolvedOrigin.replace(/\/+$/, '');
  return {
    clientId: `${cleanOrigin}/client-id.jsonld`,
    redirectUri: `${cleanOrigin}/`,
  };
}

export interface SandboxPassportPreset {
  handle: string;
  displayName: string;
  passportTheme: string;
  avatarGlbUrl?: string;
  passportUrl?: string;
  worldLinks?: readonly string[];
}

export const JARVIS_PASSPORT_PRESET: SandboxPassportPreset = {
  handle: 'jarvis',
  displayName: 'Jarvis',
  passportTheme: 'bodhi-gold',
  passportUrl: 'https://auth.wolin.id/passport/jarvis',
  worldLinks: ['https://auth.wolin.id/passport/jarvis'],
};

const LUNA_SANDBOX_PRESET: SandboxPassportPreset = {
  handle: 'luna',
  displayName: 'Luna Choi',
  passportTheme: 'lunar-mercury',
  passportUrl: 'https://auth.wolin.id/passport/luna',
  worldLinks: ['https://plaza.wolin.id/'],
};

export const SANDBOX_PASSPORT_PRESETS: readonly SandboxPassportPreset[] = [
  JARVIS_PASSPORT_PRESET,
  {
    handle: 'cyc',
    displayName: 'CYC',
    passportTheme: 'obsidian-cyan',
    passportUrl: 'https://auth.wolin.id/passport/cyc',
    worldLinks: ['https://cycorld.com/'],
  },
  LUNA_SANDBOX_PRESET,
] as const;

/**
 * Create a zero-network Sandbox Passport session backed by a real Web Crypto ES256 DPoP keypair
 * and `https://wolin.id/ns#` Turtle profile so local 3D worlds work 100% offline out of the box.
 */
export async function createSandboxPassportSession(
  preset: SandboxPassportPreset = LUNA_SANDBOX_PRESET,
): Promise<{ session: WolinSession; profile: WebIdProfile; sampleTurtle: string }> {
  const webId = `https://${preset.handle}.wolin.id/profile/card#me`;
  const podUrl = `https://${preset.handle}.wolin.id/`;
  const links =
    preset.worldLinks && preset.worldLinks.length > 0
      ? preset.worldLinks
      : ['https://plaza.wolin.id/'];
  const worldLinksLine =
    links.length > 0
      ? `  wolin:worldLinks ${links.map((u) => `<${u}>`).join(', ')} ;`
      : '';
  const sampleTurtle = [
    '@prefix foaf: <http://xmlns.com/foaf/0.1/> .',
    '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
    '@prefix pim: <http://www.w3.org/ns/pim/space#> .',
    `@prefix wolin: <${WOLIN_NS}> .`,
    '',
    `<#me> a foaf:Person ;`,
    `  foaf:name "${preset.displayName}" ;`,
    `  solid:oidcIssuer <${DEFAULT_WOLIN_ISSUER}> ;`,
    `  pim:storage <${podUrl}> ;`,
    preset.avatarGlbUrl ? `  wolin:avatarGlbUrl <${preset.avatarGlbUrl}> ;` : '',
    `  wolin:passportTheme "${preset.passportTheme}" ;`,
    worldLinksLine,
    `  wolin:wearableItem "crescent-halo-mk1" .`,
  ]
    .filter(Boolean)
    .join('\n');

  const profile = parseWebIdProfile(sampleTurtle, webId);
  const dpopKeyPair = await generateDPoPKeyPair();

  const session: WolinSession = {
    webId: profile.webId,
    handle: `${preset.handle}.wolin.id`,
    displayName: profile.name ?? preset.displayName,
    accessToken: `sandbox.${dpopKeyPair.jkt}`,
    tokenType: 'DPoP',
    dpopKeyPair,
    podUrl: profile.primaryStorage,
    oidcIssuer: DEFAULT_WOLIN_ISSUER,
    avatarGlbUrl: profile.avatarGlbUrl,
    avatarVrmUrl: profile.avatarVrmUrl,
    passportTheme: profile.passportTheme,
    worldLinks: profile.worldLinks,
    wearableItems: profile.wearableItems,
    isSandbox: true,
  };

  return { session, profile, sampleTurtle };
}
