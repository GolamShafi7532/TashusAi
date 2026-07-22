describe('Grok LLM integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(120),
      REDIS_URL: 'redis://localhost:6379',
      GROK_API_KEYS: 'gsk_real-key',
      GROK_API_BASE_URL: 'https://api.x.ai',
      EMBEDDING_PROVIDER: 'openai',
      EMBEDDING_PROVIDER_API_KEY: 'sk-test-embedding-key',
      TASHUS_API_BASE_URL: 'https://api.tashus.com',
      JWT_SIGNING_SECRET_ADMIN: '12345678901234567890123456789012',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3001',
    } as NodeJS.ProcessEnv;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      text: async () => '',
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('uses the real Grok key in development instead of the mock path', async () => {
    const { generateCompletion } = await import('../llm');

    const result = await generateCompletion('hello');

    expect(result).toBe('ok');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init?.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer gsk_real-key',
      })
    );
    expect(init?.headers).not.toHaveProperty('x-api-key');
  });

  it('rotates to the next Grok key on subsequent calls', async () => {
    process.env.GROK_API_KEYS = 'gsk_key_one,gsk_key_two';

    const { generateCompletion } = await import('../llm');

    await generateCompletion('hello');
    await generateCompletion('hello again');

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const firstHeaders = (global.fetch as jest.Mock).mock.calls[0][1]?.headers;
    const secondHeaders = (global.fetch as jest.Mock).mock.calls[1][1]?.headers;

    expect(firstHeaders).toEqual(expect.objectContaining({ Authorization: 'Bearer gsk_key_one' }));
    expect(secondHeaders).toEqual(expect.objectContaining({ Authorization: 'Bearer gsk_key_two' }));
  });
});
