/**
 * Structured JSON logger (v3.1.0 — Phase E.1)
 *
 * Outputs newline-delimited JSON to stdout/stderr so log aggregators
 * (Datadog, Papertrail, CloudWatch) can parse fields without regex.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('Tool call executed', { sessionId, toolName, durationMs });
 *   logger.error('LLM provider failed', err, { provider: 'groq' });
 */
import { env } from './env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

// Default to 'info' in production, 'debug' in development
const CONFIGURED_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ??
  (env.NODE_ENV === 'production' ? 'info' : 'debug');

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[CONFIGURED_LEVEL];
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error) {
  if (!shouldLog(level)) return;

  const entry: Record<string, unknown> = {
    ts:  new Date().toISOString(),
    lvl: level,
    msg: message,
    env: env.NODE_ENV,
    ...context,
  };

  if (error) {
    entry.error = error.message;
    if (env.NODE_ENV !== 'production') {
      entry.stack = error.stack;
    }
  }

  const line = JSON.stringify(entry);

  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => write('debug', msg, ctx),
  info:  (msg: string, ctx?: Record<string, unknown>) => write('info',  msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => write('warn',  msg, ctx),
  error: (msg: string, err?: Error | unknown, ctx?: Record<string, unknown>) => {
    const e = err instanceof Error ? err : (err ? new Error(String(err)) : undefined);
    write('error', msg, ctx, e);
  },
};
