import { isRateLimited } from '../rate-limiter';
import { redis } from '../redis';

jest.mock('../env', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379',
    NODE_ENV: 'test',
  },
}));

// Mock redis client
const mockIncr = jest.fn();
const mockExpire = jest.fn();
const mockTtl = jest.fn();

jest.mock('../redis', () => ({
  redis: {
    incr: (...args: any[]) => mockIncr(...args),
    expire: (...args: any[]) => mockExpire(...args),
    ttl: (...args: any[]) => mockTtl(...args),
  },
}));

describe('isRateLimited', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows request when within rate limits', async () => {
    // incr on minKey yields 1, incr on dayKey yields 1
    mockIncr.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    mockExpire.mockResolvedValue(1);

    const result = await isRateLimited('test-user');
    expect(result).toEqual({ limited: false });
    expect(mockExpire).toHaveBeenCalledTimes(2);
  });

  it('rate limits when minute requests exceed 20', async () => {
    // 21st request on minute key
    mockIncr.mockResolvedValueOnce(21);
    mockTtl.mockResolvedValueOnce(45);

    const result = await isRateLimited('test-user');
    expect(result).toEqual({ limited: true, retryAfter: 45 });
    expect(mockTtl).toHaveBeenCalled();
  });

  it('rate limits when daily requests exceed 100', async () => {
    // Minute count is normal (e.g. 5) but daily count is 101
    mockIncr.mockResolvedValueOnce(5).mockResolvedValueOnce(101);

    const result = await isRateLimited('test-user');
    expect(result).toEqual({ limited: true });
  });
});
