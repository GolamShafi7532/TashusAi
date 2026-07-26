/**
 * apiFetch — drop-in replacement for `fetch()` in the admin panel.
 *
 * What it does:
 * 1. Makes the original request
 * 2. If it gets a 401 → tries POST /api/admin/auth/refresh silently
 * 3. If refresh succeeds → retries the original request once with new cookies
 * 4. If refresh fails → redirects the browser to /login (with `?from=` so the
 *    user lands back on their original page after logging in)
 *
 * Usage: replace `fetch(url, opts)` with `apiFetch(url, opts)` — API is identical.
 *
 * Existing functionality is NOT affected:
 * - Dev mode bypasses still work (resolveAdmin returns Dev Admin when no cookie)
 * - All existing route logic is unchanged
 * - This only intercepts browser-side fetch calls, not server-side route handlers
 */

let refreshInProgress: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts — if one is in flight, wait for it
  if (refreshInProgress) return refreshInProgress;

  refreshInProgress = (async () => {
    try {
      const res = await fetch('/api/admin/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshInProgress = null;
    }
  })();

  return refreshInProgress;
}

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  const from = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?from=${from}`;
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // Always include cookies
  const opts: RequestInit = { credentials: 'include', ...init };

  const res = await fetch(input, opts);

  // Not a 401 — return as-is (success or other error)
  if (res.status !== 401) return res;

  // Got 401 — try to refresh
  const refreshed = await attemptRefresh();

  if (!refreshed) {
    // Refresh failed — session is fully expired, redirect to login
    redirectToLogin();
    // Return the original 401 so any in-flight awaits don't hang
    return res;
  }

  // Refresh succeeded — retry the original request once with new cookies
  const retryRes = await fetch(input, opts);

  // If still 401 after refresh, the session is gone — redirect
  if (retryRes.status === 401) {
    redirectToLogin();
  }

  return retryRes;
}
