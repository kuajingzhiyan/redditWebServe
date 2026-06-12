import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "google-oauth-jwks.json");
const CACHE_META = path.join(CACHE_DIR, "google-oauth-jwks.meta.json");
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
}

export class GoogleJwksUnavailableError extends Error {
  constructor() {
    super("GOOGLE_JWKS_UNAVAILABLE");
    this.name = "GoogleJwksUnavailableError";
  }
}

let localJwks: ReturnType<typeof createLocalJWKSet> | null = null;

async function readCacheFromDisk(): Promise<JSONWebKeySet | null> {
  try {
    const meta = JSON.parse(await readFile(CACHE_META, "utf8")) as { fetchedAt: number };
    if (Date.now() - meta.fetchedAt > CACHE_TTL_MS) {
      return null;
    }
    return JSON.parse(await readFile(CACHE_FILE, "utf8")) as JSONWebKeySet;
  } catch {
    return null;
  }
}

function setLocalJwks(jwks: JSONWebKeySet): void {
  localJwks = createLocalJWKSet(jwks);
}

export async function fetchAndSaveGoogleJwks(): Promise<JSONWebKeySet> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(JWKS_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`JWKS HTTP ${response.status}`);
    }

    const jwks = (await response.json()) as JSONWebKeySet;
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(jwks));
    await writeFile(CACHE_META, JSON.stringify({ fetchedAt: Date.now() }));
    setLocalJwks(jwks);
    return jwks;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveJwks(forceRefresh = false): Promise<ReturnType<typeof createLocalJWKSet>> {
  if (!forceRefresh && localJwks) {
    return localJwks;
  }

  if (!forceRefresh) {
    const cached = await readCacheFromDisk();
    if (cached) {
      setLocalJwks(cached);
      return localJwks!;
    }
  }

  try {
    await fetchAndSaveGoogleJwks();
    return localJwks!;
  } catch {
    throw new GoogleJwksUnavailableError();
  }
}

function shouldRefreshJwks(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as { code?: string }).code;
  return code === "ERR_JWKS_NO_MATCHING_KEY" || code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
}

export async function warmGoogleJwksCache(): Promise<void> {
  const cached = await readCacheFromDisk();
  if (cached) {
    setLocalJwks(cached);
    void fetchAndSaveGoogleJwks().catch(() => undefined);
    return;
  }

  await fetchAndSaveGoogleJwks().catch(() => undefined);
}

export async function verifyGoogleIdToken(
  credential: string,
  clientId: string,
): Promise<GoogleProfile> {
  const verify = async (jwks: ReturnType<typeof createLocalJWKSet>) => {
    const { payload } = await jwtVerify(credential, jwks, {
      audience: clientId,
      issuer: GOOGLE_ISSUERS,
    });
    return payload;
  };

  let payload;
  try {
    payload = await verify(await resolveJwks());
  } catch (error) {
    if (error instanceof GoogleJwksUnavailableError) {
      throw error;
    }
    if (shouldRefreshJwks(error)) {
      payload = await verify(await resolveJwks(true));
    } else {
      throw error;
    }
  }

  if (!payload.sub || typeof payload.email !== "string") {
    throw new Error("Invalid Google token payload");
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: typeof payload.name === "string" ? payload.name : null,
    emailVerified: payload.email_verified === true,
  };
}
