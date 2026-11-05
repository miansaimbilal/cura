import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/cura_dev'),
  JWT_ACCESS_SECRET: z.string().min(16).default('development_jwt_access_secret_super_secret_32_chars_min!'),
  JWT_REFRESH_SECRET: z.string().min(16).default('development_jwt_refresh_secret_super_secret_32_chars_min!'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(16).default(12),
  CORS_ORIGIN: z.string().default('http://localhost:8081,exp://localhost:8081'),

  // AI Provider Configuration (Phase 5)
  AI_DEFAULT_PROVIDER: z.enum(['gemini', 'groq', 'openrouter', 'cloudflare', 'xai']).default('gemini'),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  AI_FAILOVER_ORDER: z.string().default('gemini,groq,openrouter,cloudflare,xai'),

  // Workload-specific routing (Models are fully configurable, no permanent hardcoded defaults)
  AI_CHAT_PROVIDER: z.enum(['groq', 'openrouter']).default('groq'),
  AI_CHAT_MODEL: z.string().optional(),
  AI_ANALYTICS_PROVIDER: z.enum(['gemini', 'openrouter', 'cloudflare']).default('gemini'),
  AI_ANALYTICS_MODEL: z.string().optional(),
  AI_ANALYTICS_FALLBACK_PROVIDERS: z.string().default('openrouter,cloudflare'),

  // Gemini
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_API_KEYS: z.string().optional(),
  GEMINI_DEFAULT_MODEL: z.string().optional(),

  // Groq
  GROQ_API_KEY: z.string().optional(),
  GROQ_API_KEYS: z.string().optional(),
  GROQ_DEFAULT_MODEL: z.string().optional(),

  // OpenRouter
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_API_KEYS: z.string().optional(),
  OPENROUTER_DEFAULT_MODEL: z.string().optional(),

  // Cloudflare Workers AI
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_CREDENTIALS: z.string().optional(),
  CLOUDFLARE_DEFAULT_MODEL: z.string().optional(),

  // xAI Grok
  XAI_API_KEY: z.string().optional(),
  XAI_API_KEYS: z.string().optional(),
  XAI_DEFAULT_MODEL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
