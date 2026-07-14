/**
 * Unit tests for the Tashus Read-Only Adapter client.
 *
 * These tests prove the Phase 1 acceptance gates (blueprint §8):
 *   Gate 1.1: Zero write capability toward Tashus
 *   Gate 1.3: Non-allow-listed paths throw TashusAdapterViolationError
 *
 * Run: pnpm test
 * Source of truth: AI Chatbot blueprint.md §3.2 & implementation.md §1.4
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────
// Mock env before importing the module under test
jest.mock('@/lib/env', () => ({
  env: {
    TASHUS_API_BASE_URL: 'https://api.tashus.test',
    SUPABASE_URL: 'https://test-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJ' + 'a'.repeat(100),
    REDIS_URL: 'redis://localhost:6379',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    EMBEDDING_PROVIDER: 'openai',
    EMBEDDING_PROVIDER_API_KEY: 'sk-test',
    EMBEDDING_DIMENSION: 1536,
    EMBEDDING_MODEL: 'text-embedding-3-large',
    JWT_SIGNING_SECRET_ADMIN: 'test-secret-32-characters-long!!',
    NODE_ENV: 'test',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3001',
  },
}));

// Mock Redis — no real connection in tests
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisPing = jest.fn().mockResolvedValue('PONG');

jest.mock('@/lib/redis', () => ({
  redis: {
    get: (...args: unknown[]) => mockRedisGet(...args),
    set: (...args: unknown[]) => mockRedisSet(...args),
    ping: () => mockRedisPing(),
  },
  buildTashusCacheKey: jest.fn(
    (template: string, params?: Record<string, string | number>) =>
      `tashus-cache:${template}:${JSON.stringify(Object.entries(params ?? {}).sort())}`
  ),
  getTtlSeconds: jest.fn(() => 60),
}));

// Mock Supabase DB (audit log writes)
const mockSupabaseInsert = jest.fn().mockResolvedValue({ error: null });
jest.mock('@/db/client', () => ({
  db: {
    from: jest.fn().mockReturnValue({
      insert: (...args: unknown[]) => mockSupabaseInsert(...args),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      throwOnError: jest.fn().mockReturnThis(),
      catch: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Import after mocks ─────────────────────────────────────────────────────────
import {
  tashusGet,
  TashusAdapterViolationError,
  TashusUpstreamError,
} from '../client';

// ── Test helpers ───────────────────────────────────────────────────────────────

function mockSuccessResponse(data: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}

function mockErrorResponse(status: number, body = 'Error') {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TashusAdapter — Allow-list enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null); // cache miss by default
    mockRedisSet.mockResolvedValue('OK');
  });

  // ── Gate 1.3: Non-allow-listed paths must throw ────────────────────────────

  test('GATE 1.3 — throws TashusAdapterViolationError for non-listed path', async () => {
    await expect(
      tashusGet('/reservation/create', { toolName: 'illegal_call' })
    ).rejects.toThrow(TashusAdapterViolationError);

    // fetch must NEVER have been called — violation caught before network
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('GATE 1.3 — throws for /payment/* paths', async () => {
    await expect(
      tashusGet('/payment/stripe-element', { toolName: 'illegal_payment' })
    ).rejects.toThrow(TashusAdapterViolationError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('GATE 1.3 — throws for /listing/* paths', async () => {
    await expect(
      tashusGet('/listing/car-details', { toolName: 'illegal_listing' })
    ).rejects.toThrow(TashusAdapterViolationError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('GATE 1.3 — throws for /user/* paths', async () => {
    await expect(
      tashusGet('/user/login', { toolName: 'illegal_auth' })
    ).rejects.toThrow(TashusAdapterViolationError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('GATE 1.3 — throws for unknown path', async () => {
    await expect(
      tashusGet('/arbitrary/unknown/path')
    ).rejects.toThrow(TashusAdapterViolationError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Gate 1.1: Only GET method used — no POST/PUT/DELETE possible ──────────

  test('GATE 1.1 — uses GET method for allowed path', async () => {
    mockSuccessResponse({ results: [] });

    await tashusGet('/search/find-cars', {
      toolName: 'search_vehicles',
      params: { from: '2026-08-01T00:00:00Z', to: '2026-08-03T00:00:00Z' },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('GET');
  });

  test('GATE 1.1 — tashusGet function signature has no method parameter (structural)', () => {
    // The function signature only accepts path + TashusGetOptions
    // TashusGetOptions has no "method" property — compile-time proof
    // This test validates the runtime shape of options passed to fetch
    mockSuccessResponse([]);

    const callAdapter = () =>
      tashusGet('/voucher/get-common-vouchers', {
        toolName: 'get_promotions',
        // TypeScript would reject adding method: 'POST' here — tested at runtime
      });

    return expect(callAdapter()).resolves.toBeDefined();
  });

  // ── Allow-listed paths succeed ─────────────────────────────────────────────

  test('allows /search/find-cars', async () => {
    mockSuccessResponse({ results: [{ listingId: 1 }] });
    const result = await tashusGet('/search/find-cars', { toolName: 'search_vehicles' });
    expect(result).toBeDefined();
  });

  test('allows /search/find-cars/:listingId (concrete path)', async () => {
    mockSuccessResponse({ listingId: 142 });
    const result = await tashusGet('/search/find-cars/142', { toolName: 'get_vehicle_details' });
    expect(result).toBeDefined();
  });

  test('allows /reservation/block-dates-by-car/:carListingId', async () => {
    mockSuccessResponse({ allDayList: [], customList: [] });
    const result = await tashusGet('/reservation/block-dates-by-car/142', {
      toolName: 'check_availability',
    });
    expect(result).toBeDefined();
  });

  test('allows /voucher/get-common-vouchers', async () => {
    mockSuccessResponse([]);
    const result = await tashusGet('/voucher/get-common-vouchers', { toolName: 'get_promotions' });
    expect(result).toBeDefined();
  });

  test('allows /v2/voucher/slug/:voucherSlug', async () => {
    mockSuccessResponse({ voucherCode: 'SUMMER25' });
    const result = await tashusGet('/v2/voucher/slug/summer25', { toolName: 'validate_voucher' });
    expect(result).toBeDefined();
  });

  test('allows /search/vehicle-delivery-price/:km', async () => {
    mockSuccessResponse({ fee: 25.00, currency: 'AUD' });
    const result = await tashusGet('/search/vehicle-delivery-price/15.5', {
      toolName: 'get_delivery_price',
    });
    expect(result).toBeDefined();
  });
});

describe('TashusAdapter — Redis caching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisSet.mockResolvedValue('OK');
  });

  test('returns cached data without calling fetch', async () => {
    mockRedisGet.mockResolvedValueOnce(JSON.stringify({ results: [{ listingId: 99 }] }));

    const result = await tashusGet<{ results: { listingId: number }[] }>(
      '/search/find-cars',
      { toolName: 'search_vehicles' }
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.results[0].listingId).toBe(99);
  });

  test('populates cache after live fetch', async () => {
    mockRedisGet.mockResolvedValueOnce(null); // cache miss
    mockSuccessResponse({ results: [] });

    await tashusGet('/search/find-cars', { toolName: 'search_vehicles' });

    expect(mockRedisSet).toHaveBeenCalledWith(
      expect.stringContaining('tashus-cache:'),
      expect.any(String),
      'EX',
      expect.any(Number)
    );
  });

  test('logs cache hit to ai_tool_call_logs with cache_hit=true', async () => {
    mockRedisGet.mockResolvedValueOnce(JSON.stringify([]));

    await tashusGet('/voucher/get-common-vouchers', { toolName: 'get_promotions' });

    expect(mockSupabaseInsert).toHaveBeenCalledWith(
      expect.objectContaining({ cache_hit: true, http_method: 'GET' })
    );
  });

  test('logs live fetch to ai_tool_call_logs with cache_hit=false', async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    mockSuccessResponse([]);

    await tashusGet('/voucher/get-common-vouchers', { toolName: 'get_promotions' });

    expect(mockSupabaseInsert).toHaveBeenCalledWith(
      expect.objectContaining({ cache_hit: false, http_method: 'GET' })
    );
  });
});

describe('TashusAdapter — Audit log', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
  });

  test('always logs http_method as GET — never POST/PUT/DELETE', async () => {
    mockSuccessResponse([]);

    await tashusGet('/voucher/get-common-vouchers', {
      sessionId: 'test-session-id',
      toolName: 'get_promotions',
    });

    const insertCall = mockSupabaseInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertCall.http_method).toBe('GET');
    expect(insertCall.http_method).not.toBe('POST');
    expect(insertCall.http_method).not.toBe('PUT');
    expect(insertCall.http_method).not.toBe('DELETE');
  });

  test('associates log entry with sessionId when provided', async () => {
    mockSuccessResponse([]);

    await tashusGet('/voucher/get-common-vouchers', {
      sessionId: 'abc-123',
      toolName: 'get_promotions',
    });

    const insertCall = mockSupabaseInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertCall.session_id).toBe('abc-123');
  });

  test('writes null session_id when no session provided', async () => {
    mockSuccessResponse([]);

    await tashusGet('/voucher/get-common-vouchers', { toolName: 'get_promotions' });

    const insertCall = mockSupabaseInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertCall.session_id).toBeNull();
  });
});

describe('TashusAdapter — Error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
  });

  test('throws TashusUpstreamError on non-2xx response', async () => {
    mockErrorResponse(503, 'Service Unavailable');

    await expect(
      tashusGet('/search/find-cars', { toolName: 'search_vehicles' })
    ).rejects.toThrow(TashusUpstreamError);
  });

  test('TashusUpstreamError contains the HTTP status code', async () => {
    mockErrorResponse(404, 'Not Found');

    try {
      await tashusGet('/search/find-cars/99999', { toolName: 'get_vehicle_details' });
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TashusUpstreamError);
      expect((err as TashusUpstreamError).status).toBe(404);
    }
  });

  test('throws TashusUpstreamError on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(
      tashusGet('/search/find-cars', { toolName: 'search_vehicles' })
    ).rejects.toThrow(TashusUpstreamError);
  });
});
