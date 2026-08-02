/**
 * Environment variable validation using Zod.
 * The app crashes on startup if any required var is missing or malformed.
 * Import { env } from '@/lib/env' everywhere — never process.env directly.
 *
 * Source of truth: AI Chatbot blueprint.md §11
 */
import { z } from 'zod';

const envSchema = z.object({
  // ── Node ──────────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // ── Supabase (AI-only project — NEVER Tashus infrastructure) ─────────────
  SUPABASE_URL: z
    .string()
    .url()
    .refine((u) => !u.includes('tashus.supabase'), {
      message: 'SUPABASE_URL must not point at a Tashus-owned Supabase project',
    }),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(100, 'Must be a full service_role JWT, not an anon key'),

  // ── Redis ─────────────────────────────────────────────────────────────────
  REDIS_URL: z.string().min(10),

  // ── LLM ──────────────────────────────────────────────────────────────────
  // Either Anthropic or Grok keys must be present. At least one provider
  // should be configured for LLM functionality to work.
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),
  GROK_API_KEYS: z.string().optional(),
  GROK_API_BASE_URL: z.string().url().optional(),

  // ── Embeddings ───────────────────────────────────────────────────────────
  EMBEDDING_PROVIDER: z.enum(['openai', 'voyage']).default('openai'),
  EMBEDDING_PROVIDER_API_KEY: z.string().min(10),
  EMBEDDING_DIMENSION: z.coerce.number().int().positive().default(1536),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-large'),

  // ── Tashus Read-Only Adapter ──────────────────────────────────────────────
  // This is the ONLY Tashus-facing env var. No Mongo URI, no Tashus auth secrets.
  TASHUS_API_BASE_URL: z.string().url(),
  TASHUS_JWT_JWKS_URL: z.string().url().optional(),

  // ── Admin JWT ─────────────────────────────────────────────────────────────
  // Must be distinct from any Tashus NEXTAUTH_SECRET value.
  JWT_SIGNING_SECRET_ADMIN: z.string().min(32),

  // ── LLM Fallback (Phase D.2) ──────────────────────────────────────────────
  // OpenRouter API key — optional; enables 3rd-provider fallback
  OPENROUTER_API_KEY: z.string().optional(),

  // ── Widget CORS ───────────────────────────────────────────────────────────
  // Comma-separated list of origins allowed to load the widget.
  // Examples:
  //   Development:  http://localhost:3000,http://localhost:5173
  //   Production:   https://tashus.com,https://www.tashus.com
  // Use * to allow ALL origins (only for development / internal tools).
  WIDGET_ALLOWED_ORIGINS: z.string().default('*'),

  // ── Observability (separate Sentry project from Tashus) ───────────────────
  SENTRY_DSN_AI: z.string().url().optional(),
});

// Ensure at least one LLM provider is configured
function validateEnv() {
  // During Next.js build phase, environment variables are not available.
  // Skip strict validation so the build completes — validation runs again
  // at runtime when the actual values are injected by Vercel.
  const isBuildPhase =
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.CI === 'true' && !process.env.SUPABASE_URL;

  if (isBuildPhase) {
    // Return safe defaults so the module loads without crashing
    return envSchema.parse({
      NODE_ENV: process.env.NODE_ENV || 'production',
      SUPABASE_URL: process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key-min-100-chars-for-build-phase-only-not-real-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
      EMBEDDING_PROVIDER_API_KEY: process.env.EMBEDDING_PROVIDER_API_KEY || 'placeholder',
      TASHUS_API_BASE_URL: process.env.TASHUS_API_BASE_URL || 'https://api.tashus.com',
      JWT_SIGNING_SECRET_ADMIN: process.env.JWT_SIGNING_SECRET_ADMIN || 'placeholder-secret-32-chars-minimum-xx',
      GROK_API_KEYS: process.env.GROK_API_KEYS || 'placeholder',
    });
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `\n❌ Invalid environment variables:\n${formatted}\n\nSee .env.example for required configuration.`
    );
  }

  const data = result.data;
  if (!data.ANTHROPIC_API_KEY && !data.GROK_API_KEYS) {
    throw new Error('\n❌ Invalid environment variables:\n  • LLM provider missing: set ANTHROPIC_API_KEY or GROK_API_KEYS in .env');
  }

  return data;
}
// Singleton — validated once at module load time.
export const env = validateEnv();

export type Env = z.infer<typeof envSchema>;
