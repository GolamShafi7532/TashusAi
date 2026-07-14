import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_AI_BACKEND_URL: z.string().url().default('http://localhost:3001'),
  SUPABASE_URL: z.string().url().default('https://example.supabase.co'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10).default('local-dev-service-role-key'),
  JWT_SIGNING_SECRET_ADMIN: z.string().min(32).default('local-dev-admin-secret-1234567890'),
  REDIS_URL: z.string().min(10).default('redis://localhost:6379'),
  EMBEDDING_PROVIDER: z.enum(['openai', 'voyage']).default('openai'),
  EMBEDDING_PROVIDER_API_KEY: z.string().min(10).default('local-dev-embedding-key'),
  EMBEDDING_DIMENSION: z.coerce.number().int().positive().default(1536),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-large'),
});

function validateEnv() {
  const getEnv = (key: string) => {
    const val = process.env[key];
    return val === '' ? undefined : val;
  };

  const result = envSchema.safeParse({
    NEXT_PUBLIC_AI_BACKEND_URL: getEnv('NEXT_PUBLIC_AI_BACKEND_URL'),
    SUPABASE_URL: getEnv('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: getEnv('SUPABASE_SERVICE_ROLE_KEY'),
    JWT_SIGNING_SECRET_ADMIN: getEnv('JWT_SIGNING_SECRET_ADMIN'),
    REDIS_URL: getEnv('REDIS_URL'),
    EMBEDDING_PROVIDER: getEnv('EMBEDDING_PROVIDER'),
    EMBEDDING_PROVIDER_API_KEY: getEnv('EMBEDDING_PROVIDER_API_KEY'),
    EMBEDDING_DIMENSION: getEnv('EMBEDDING_DIMENSION'),
    EMBEDDING_MODEL: getEnv('EMBEDDING_MODEL'),
  });

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`❌ Invalid admin environment variables:\n${formatted}`);
    // Safe fallback for compilation/build step if variables are missing
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Missing production environment variables');
    }
  }

  return (result.success ? result.data : envSchema.parse({})) as z.infer<typeof envSchema>;
}

export const env = validateEnv();
