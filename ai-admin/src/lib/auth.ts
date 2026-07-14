import * as argon2 from 'argon2';
import * as jose from 'jose';
import { env } from './env';

// Access Token expires in 15 minutes, Refresh Token in 7 days
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

/**
 * Hash a password using argon2.
 */
export async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64MB
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verify a password against an argon2 hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (err) {
    console.error('[Auth] Password verification failed:', err);
    return false;
  }
}

/**
 * Get secret key as Uint8Array for jose signing.
 */
function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SIGNING_SECRET_ADMIN);
}

export interface AdminJwtPayload {
  userId: string;
  email: string;
  role: string;
  displayName: string;
}

/**
 * Extract the admin access token from a request's cookies or Authorization header.
 */
export function getAdminAccessTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  const cookieHeader = req.headers.get('cookie') ?? '';
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('admin_access_token='));

  if (!cookie) return null;

  return decodeURIComponent(cookie.slice('admin_access_token='.length));
}

/**
 * Load the authenticated admin from a request using the access token.
 */
export async function getAdminFromRequest(req: Request): Promise<AdminJwtPayload | null> {
  const token = getAdminAccessTokenFromRequest(req);
  if (!token) return null;
  return verifyJwt(token);
}

/**
 * Generate an Access JWT token.
 */
export async function signAccessToken(payload: AdminJwtPayload): Promise<string> {
  return await new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(getSecretKey());
}

/**
 * Generate a Refresh JWT token.
 */
export async function signRefreshToken(payload: { userId: string }): Promise<string> {
  return await new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(getSecretKey());
}

/**
 * Verify a JWT token.
 */
export async function verifyJwt(token: string): Promise<AdminJwtPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecretKey());
    return payload as unknown as AdminJwtPayload;
  } catch (err) {
    return null;
  }
}
