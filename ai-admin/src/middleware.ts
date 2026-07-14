import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as jose from 'jose';

// Exclude public paths from auth middleware
const PUBLIC_PATHS = [
  '/login',
  '/api/admin/auth/login',
  '/api/admin/auth/signup',
  '/api/admin/auth/refresh',
  '/api/admin/auth/logout',
];

/**
 * Next.js Middleware to protect administrative routes and handle automatic token rotation.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isLocalDev = process.env.NODE_ENV !== 'production';
  const isLocalHost = req.headers.get('host')?.includes('localhost') || req.headers.get('host')?.includes('127.0.0.1');

  // 1. Allow public paths without checking auth
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path))) {
    return NextResponse.next();
  }

  if (isLocalDev && isLocalHost) {
    return NextResponse.next();
  }

  const secretKey = process.env.JWT_SIGNING_SECRET_ADMIN || 'local-dev-admin-secret-1234567890';
  if (!secretKey) {
    console.error('[Middleware] JWT_SIGNING_SECRET_ADMIN is missing');
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const encodedSecret = new TextEncoder().encode(secretKey);
  const accessToken = req.cookies.get('admin_access_token')?.value;

  // 2. Attempt verification of access token
  if (accessToken) {
    try {
      await jose.jwtVerify(accessToken, encodedSecret);
      return NextResponse.next();
    } catch (err: any) {
      // Access token invalid or expired, continue to attempt refresh
    }
  }

  // 3. Access token missing/expired. Attempt token rotation using refresh token
  const refreshToken = req.cookies.get('admin_refresh_token')?.value;
  if (!refreshToken) {
    // No tokens available — redirect to login
    return redirectToLogin(req);
  }

  try {
    // Contact the refresh API to get rotated tokens
    const refreshUrl = new URL('/api/admin/auth/refresh', req.nextUrl.origin);
    const refreshResponse = await fetch(refreshUrl, {
      method: 'POST',
      headers: {
        Cookie: `admin_refresh_token=${refreshToken}`,
      },
    });

    if (!refreshResponse.ok) {
      return redirectToLogin(req);
    }

    // Parse rotated cookies from refresh response headers
    const rawCookies = refreshResponse.headers.getSetCookie();
    
    // Continue the request and inject cookies into the client browser response
    const response = NextResponse.next();
    
    for (const cookieStr of rawCookies) {
      const parts = cookieStr.split(';')[0].split('=');
      const name = parts[0].trim();
      const value = parts[1].trim();
      
      response.cookies.set(name, value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
    }

    return response;
  } catch (err) {
    console.error('[Middleware] Token rotation failed:', err);
    return redirectToLogin(req);
  }
}

function redirectToLogin(req: NextRequest) {
  // If request is an API request, return 401 instead of a redirect
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const loginUrl = new URL('/login', req.url);
  // Store the original path to redirect back after login
  loginUrl.searchParams.set('from', req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

// Protect all admin page routes and admin API endpoints
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
