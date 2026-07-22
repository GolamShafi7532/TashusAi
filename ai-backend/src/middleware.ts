/**
 * Next.js Edge Middleware — CORS for widget-facing /api/ai/* routes
 *
 * Runs before every request on the matched paths. Adds Access-Control headers
 * so the widget.js bundle can be loaded on ANY external website.
 *
 * Allowed origins are controlled by the WIDGET_ALLOWED_ORIGINS env var:
 *   - '*'                           → allow every origin (dev / internal tools)
 *   - 'https://tashus.com'          → single origin
 *   - 'https://tashus.com,https://www.tashus.com'  → multiple origins (comma-separated)
 *
 * Admin routes (/api/admin/*) are intentionally excluded — they use their own
 * JWT-cookie authentication and should never be called cross-origin by the widget.
 */

import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse WIDGET_ALLOWED_ORIGINS into a Set for O(1) lookup. */
function getAllowedOrigins(): Set<string> | '*' {
  const raw = process.env.WIDGET_ALLOWED_ORIGINS ?? '*';
  if (raw.trim() === '*') return '*';
  return new Set(
    raw
      .split(',')
      .map((o) => o.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Return the correct Access-Control-Allow-Origin value for this request. */
function resolveOrigin(
  requestOrigin: string | null,
  allowed: Set<string> | '*'
): string {
  if (!requestOrigin) return '*'; // Fallback if no origin header
  if (allowed === '*') return requestOrigin; // Always reflect the specific origin back for credentials: 'include'
  
  const normalised = requestOrigin.toLowerCase();
  return allowed.has(normalised) ? requestOrigin : 'null';
}

/** Standard CORS headers shared by every widget API response. */
function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Visitor-Id',
    // Cache the preflight response for 2 hours to minimise OPTIONS round-trips.
    'Access-Control-Max-Age': '7200',
    // Expose headers the SSE client needs to read.
    'Access-Control-Expose-Headers': 'Content-Type, X-Session-Id',
    // Required for Shadow-DOM embedded widgets on cross-origin pages.
    'Vary': 'Origin',
  };
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

const WIDGET_API_PREFIX = '/api/ai/';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only apply CORS to widget-facing AI routes.
  // Admin routes (/api/admin/*) are excluded intentionally.
  if (!pathname.startsWith(WIDGET_API_PREFIX)) {
    return NextResponse.next();
  }

  const allowed = getAllowedOrigins();
  const requestOrigin = req.headers.get('origin');
  const origin = resolveOrigin(requestOrigin, allowed);

  // ── Preflight (OPTIONS) ─────────────────────────────────────────────────
  // Browsers send an OPTIONS request before any cross-origin POST.
  // We must respond 204 immediately — if we let it reach the route handler
  // it will try to parse an empty body and crash.
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  // ── Normal request ──────────────────────────────────────────────────────
  // Let the request continue to the route handler, then inject CORS headers
  // into the response. This approach works for regular JSON routes.
  // NOTE: The streaming /chat/stream route injects its own CORS headers
  //       directly (see stream/route.ts) because NextResponse.next() cannot
  //       modify streaming ReadableStream responses after the fact.
  const response = NextResponse.next();
  const headers = corsHeaders(origin);
  Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));

  return response;
}

// ---------------------------------------------------------------------------
// Route matcher
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    /*
     * Match all /api/ai/* paths.
     * Explicitly exclude Next.js internals and static files.
     */
    '/api/ai/:path*',
  ],
};
