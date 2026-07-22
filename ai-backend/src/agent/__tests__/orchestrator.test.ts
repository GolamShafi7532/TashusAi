/**
 * Unit tests for the streaming orchestrator.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────
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

const mockGet = jest.fn();
const mockSet = jest.fn();
const mockUpdate = jest.fn();
jest.mock('@/lib/redis', () => ({
  redis: {
    get: (...args: any[]) => mockGet(...args),
    set: (...args: any[]) => mockSet(...args),
    hincrby: jest.fn().mockResolvedValue(1),
    hincrbyfloat: jest.fn().mockResolvedValue(1),
    zadd: jest.fn().mockResolvedValue(1),
    zremrangebyrank: jest.fn().mockResolvedValue(1),
    lpush: jest.fn().mockResolvedValue(1),
    ltrim: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    hgetall: jest.fn().mockResolvedValue({}),
  },
  getRedisSubscriber: jest.fn().mockReturnValue({
    subscribe: jest.fn().mockResolvedValue(1),
    unsubscribe: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
    off: jest.fn(),
  }),
  buildSessionControlChannel: (id: string) => `session:${id}:control`,
}));

const mockInsert = jest.fn().mockReturnValue({
  select: jest.fn().mockReturnValue({
    single: jest.fn().mockResolvedValue({ data: { id: 'log-123' }, error: null }),
  }),
});

/**
 * Build a chainable mock that resolves to `resolvedValue` at the end of any
 * chain of .select / .eq / .order / .limit / .single / .update calls.
 */
function chainable(resolvedValue: any): any {
  const self: any = {};
  const methods = ['select', 'eq', 'order', 'limit', 'single', 'update', 'delete'];
  for (const m of methods) {
    if (m === 'single') {
      self[m] = jest.fn().mockResolvedValue(resolvedValue);
    } else {
      self[m] = jest.fn().mockReturnValue(self);
    }
  }
  // insert returns { select().single() }
  self.insert = jest.fn().mockImplementation((...args: any[]) => {
    mockInsert(...args);
    return {
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: 'inserted-id' }, error: null }),
      }),
    };
  });
  self.update = jest.fn().mockImplementation((...args: any[]) => {
    mockUpdate(...args);
    return self;
  });
  return self;
}

// Per-table resolved values — the orchestrator queries multiple tables
const tableResolvers: Record<string, any> = {
  ai_chat_sessions: chainable({ data: { metadata: {} }, error: null }),
  ai_chat_messages: chainable({ data: [], error: null, count: 3 }),
  ai_agent_configs: chainable({
    data: {
      id: 'cfg-1',
      config_key: 'production',
      system_prompt: 'You are a helpful support assistant.',
      model: 'claude-3-5-sonnet-20240620',
      temperature: 0.3,
      max_tokens: 1024,
      enabled_tools: ['search_vehicles', 'check_availability', 'validate_voucher', 'search_knowledge_base'],
      is_active: true,
      updated_by: null,
      updated_at: new Date().toISOString(),
    },
    error: null,
  }),
  ai_tool_call_logs: chainable({ data: { id: 'log-1' }, error: null }),
};
const defaultChain = chainable({ data: null, error: null });

jest.mock('@/db/client', () => ({
  db: {
    from: jest.fn((table: string) => tableResolvers[table] ?? defaultChain),
  },
}));

jest.mock('@/rag/retriever', () => ({
  retrieve: jest.fn().mockResolvedValue({
    context: 'Mocked context',
    sources: [{ title: 'Doc A', page: 1 }],
  }),
  searchKnowledgeBaseTool: jest.fn().mockResolvedValue('KB result'),
}));

const mockExecuteTool = jest.fn().mockResolvedValue({ available: true });
jest.mock('@/agent/tools', () => ({
  executeTool: (...args: any[]) => mockExecuteTool(...args),
  AGENT_TOOLS: [
    { name: 'search_vehicles', description: 'desc', input_schema: {} },
    { name: 'check_availability', description: 'desc', input_schema: {} },
  ],
}));

const mockGenerateStream = jest.fn();
jest.mock('@/agent/llm', () => ({
  generateCompletionStream: (...args: any[]) => mockGenerateStream(...args),
}));

jest.mock('@/lib/queue', () => ({
  enqueueSummarizeSession: jest.fn().mockResolvedValue(true),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────
import { processMessageStream } from '../orchestrator';

describe('Orchestrator — processMessageStream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue('OK');
  });

  test('streams simple text response without tool calls', async () => {
    // Mock the LLM stream yielding text
    mockGenerateStream.mockImplementation(async function* () {
      yield { type: 'text', text: 'Hello' };
      yield { type: 'text', text: ' world!' };
    });

    const generator = processMessageStream('session-123', 'Hi');
    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'token', text: 'Hello' },
      { type: 'token', text: ' world!' },
      {
        type: 'done',
        message: 'Hello world!',
        sources: [{ title: 'Doc A', page: 1 }],
      },
    ]);

    // DB calls: user message insert, config loading, assistant message insert
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'session-123',
        role: 'user',
        content: 'Hi',
      })
    );

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'session-123',
        role: 'assistant',
        content: 'Hello world!',
      })
    );
  });

  test('streams response with a tool call', async () => {
    // First round yields a tool call, second round yields final text
    let round = 0;
    mockGenerateStream.mockImplementation(async function* () {
      if (round === 0) {
        round++;
        yield {
          type: 'tool_call',
          id: 'tool-u1',
          name: 'check_availability',
          args: { carListingId: 42 },
        };
      } else {
        yield { type: 'text', text: 'Yes, it is available.' };
      }
    });

    const generator = processMessageStream('session-123', 'Is car 42 free?');
    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'tool_start', tool: 'check_availability', input: { carListingId: 42 } },
      { type: 'tool_result', tool: 'check_availability', result: { available: true } },
      { type: 'token', text: 'Yes, it is available.' },
      {
        type: 'done',
        message: 'Yes, it is available.',
        sources: [{ title: 'Doc A', page: 1 }],
      },
    ]);

    expect(mockExecuteTool).toHaveBeenCalledWith('check_availability', { carListingId: 42 }, { sessionId: 'session-123' });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_name: 'check_availability',
        http_method: 'GET',
        endpoint: 'check_availability',
      })
    );
  });

  test('aborts tool execution and disables tools on the 5th round', async () => {
    // Keep yielding tool calls to force the orchestrator to loop
    mockGenerateStream.mockImplementation(async function* () {
      yield {
        type: 'tool_call',
        id: 'tool-infinite',
        name: 'check_availability',
        args: { carListingId: 99 },
      };
    });

    const generator = processMessageStream('session-123', 'Keep running tools');
    const events = [];
    try {
      for await (const event of generator) {
        events.push(event);
      }
    } catch (e) {
      // Ignore final errors if any
    }

    // Assert generateCompletionStream was called 5 times
    expect(mockGenerateStream).toHaveBeenCalledTimes(5);

    // Verify the 5th round arguments (last call) had empty tools array
    const lastCallParams = mockGenerateStream.mock.calls[4][0];
    expect(lastCallParams.tools).toEqual([]);
  });

  test('aborts with offline message when agent config is_active is false (Kill-Switch)', async () => {
    // Enable kill-switch by setting active config is_active to false
    const originalResolver = tableResolvers.ai_agent_configs;
    tableResolvers.ai_agent_configs = chainable({
      data: {
        id: 'cfg-1',
        config_key: 'production',
        system_prompt: 'You are offline.',
        model: 'claude-3-5-sonnet-20240620',
        temperature: 0.3,
        max_tokens: 1024,
        enabled_tools: [],
        is_active: false,
        updated_at: new Date().toISOString(),
      },
      error: null,
    });

    const generator = processMessageStream('session-123', 'Hello');
    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: 'done',
        message: 'Tashus AI Support is currently offline. A human representative will get back to you shortly.',
        sources: [],
      },
    ]);

    // Ensure no LLM streaming calls were triggered
    expect(mockGenerateStream).not.toHaveBeenCalled();

    // Restore configuration
    tableResolvers.ai_agent_configs = originalResolver;
  });

  test('records tokens_in, tokens_out, and latency metrics in assistant message logs', async () => {
    mockGenerateStream.mockImplementation(async function* () {
      yield { type: 'usage', input_tokens: 120, output_tokens: 45 };
      yield { type: 'text', text: 'Logged metrics response.' };
    });

    const generator = processMessageStream('session-123', 'Test metrics');
    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    // Verify correct properties inserted in db
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        content: 'Logged metrics response.',
        tokens_in: 120,
        tokens_out: 45,
        latency_ms: expect.any(Number),
      })
    );
  });

  test('backfills token metrics onto tool-call audit rows after a turn completes', async () => {
    let round = 0;
    mockGenerateStream.mockImplementation(async function* () {
      if (round === 0) {
        round++;
        yield { type: 'usage', input_tokens: 120, output_tokens: 45 };
        yield {
          type: 'tool_call',
          id: 'tool-audit',
          name: 'check_availability',
          args: { carListingId: 42 },
        };
      } else {
        yield { type: 'text', text: 'Token-backed audit response.' };
      }
    });

    const generator = processMessageStream('session-123', 'Audit token flow');
    for await (const _ of generator) {
      // consume stream
    }

    const matchedPayloads = mockUpdate.mock.calls.filter(([payload]) => (
      typeof payload?.tokens_in === 'number' &&
      payload.tokens_in > 0 &&
      typeof payload?.tokens_out === 'number' &&
      payload.tokens_out > 0 &&
      payload?.provider === 'anthropic' &&
      typeof payload?.token_cost_usd === 'number'
    ));

    expect(matchedPayloads.length).toBeGreaterThan(0);
  });
});
