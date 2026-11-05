import { z } from 'zod';
import type { AIProviderCredential, AIProviderId, AIWorkloadType } from './types';

export const AI_DEFAULT_FAILOVER_ORDER: AIProviderId[] = [
  'gemini',
  'groq',
  'openrouter',
  'cloudflare',
  'xai',
];

export const ALLOWED_WORKLOAD_PROVIDERS: Record<AIWorkloadType, AIProviderId[]> = {
  chat: ['groq', 'openrouter'],
  analytics: ['gemini', 'openrouter', 'cloudflare'],
};

export interface WorkloadConfig {
  allowedProviders: AIProviderId[];
  defaultProvider: AIProviderId;
  defaultModel?: string;
  fallbackProviders: AIProviderId[];
}

export interface AIWorkloadSettings {
  chat: WorkloadConfig;
  analytics: WorkloadConfig;
}

export const DEFAULT_AI_WORKLOADS: AIWorkloadSettings = {
  chat: {
    allowedProviders: ALLOWED_WORKLOAD_PROVIDERS.chat,
    defaultProvider: 'groq',
    defaultModel: undefined,
    fallbackProviders: [],
  },
  analytics: {
    allowedProviders: ALLOWED_WORKLOAD_PROVIDERS.analytics,
    defaultProvider: 'gemini',
    defaultModel: undefined,
    fallbackProviders: ['openrouter', 'cloudflare'],
  },
};

export interface ProviderRawConfig {
  apiKey?: string;
  credentials?: AIProviderCredential[];
  defaultModel?: string;
  accountId?: string; // Cloudflare-specific
}

export interface AIModuleConfig {
  defaultProvider: AIProviderId;
  defaultTimeoutMs: number;
  failoverOrder: AIProviderId[];
  workloads?: AIWorkloadSettings;
  providers: Record<AIProviderId, ProviderRawConfig>;
}

export function parseCredentialsFromEnv(
  provider: AIProviderId,
  multiKeyRaw?: string,
  singleKeyRaw?: string,
  defaultAccountId?: string
): AIProviderCredential[] {
  const credentials: AIProviderCredential[] = [];

  if (multiKeyRaw && multiKeyRaw.trim().length > 0) {
    const trimmed = multiKeyRaw.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          parsed.forEach((item, index) => {
            if (typeof item === 'string' && item.trim().length > 0) {
              credentials.push({
                id: `${provider}_key_${index + 1}`,
                apiKey: item.trim(),
                accountId: defaultAccountId,
                enabled: true,
              });
            } else if (item && typeof item === 'object') {
              const obj = item as Record<string, unknown>;
              const apiKey = (obj.apiKey ?? obj.apiToken ?? obj.token ?? obj.key) as
                | string
                | undefined;
              if (apiKey && typeof apiKey === 'string' && apiKey.trim().length > 0) {
                credentials.push({
                  id: (obj.id as string) || `${provider}_key_${index + 1}`,
                  apiKey: apiKey.trim(),
                  accountId: (obj.accountId as string) || defaultAccountId,
                  enabled: obj.enabled !== false,
                });
              }
            }
          });
        }
      } catch (err) {
        console.warn(`[AI Config] Failed to parse JSON credentials for ${provider}:`, err);
      }
    } else {
      // Comma-separated list of keys
      const tokens = trimmed.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
      tokens.forEach((token, index) => {
        credentials.push({
          id: `${provider}_key_${index + 1}`,
          apiKey: token,
          accountId: defaultAccountId,
          enabled: true,
        });
      });
    }
  }

  // Fallback to legacy single key if no credentials were parsed from multi-key
  if (credentials.length === 0 && singleKeyRaw && singleKeyRaw.trim().length > 0) {
    credentials.push({
      id: `${provider}_primary`,
      apiKey: singleKeyRaw.trim(),
      accountId: defaultAccountId,
      enabled: true,
    });
  }

  return credentials;
}

export const providerConfigSchema = z.object({
  AI_DEFAULT_PROVIDER: z
    .enum(['gemini', 'groq', 'openrouter', 'cloudflare', 'xai'])
    .default('gemini'),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  AI_FAILOVER_ORDER: z
    .string()
    .default('gemini,groq,openrouter,cloudflare,xai')
    .transform((val) => {
      const parts = val.split(',').map((p) => p.trim() as AIProviderId);
      const valid: AIProviderId[] = ['gemini', 'groq', 'openrouter', 'cloudflare', 'xai'];
      return parts.filter((p) => valid.includes(p));
    }),

  // Workload: Interactive Chat (No hardcoded model)
  AI_CHAT_PROVIDER: z.enum(['groq', 'openrouter']).default('groq'),
  AI_CHAT_MODEL: z.string().optional(),

  // Workload: Analytics / Background Insights (No hardcoded model)
  AI_ANALYTICS_PROVIDER: z.enum(['gemini', 'openrouter', 'cloudflare']).default('gemini'),
  AI_ANALYTICS_MODEL: z.string().optional(),
  AI_ANALYTICS_FALLBACK_PROVIDERS: z
    .string()
    .default('openrouter,cloudflare')
    .transform((val) => {
      const parts = val.split(',').map((p) => p.trim() as AIProviderId);
      const valid: AIProviderId[] = ['gemini', 'openrouter', 'cloudflare'];
      return parts.filter((p) => valid.includes(p));
    }),

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

export type AIEnvConfig = z.infer<typeof providerConfigSchema>;

export function getAIConfig(
  envSource: Record<string, string | undefined> = process.env
): AIModuleConfig {
  const parsed = providerConfigSchema.safeParse(envSource);
  const data = parsed.success ? parsed.data : providerConfigSchema.parse({});

  const geminiCreds = parseCredentialsFromEnv('gemini', data.GEMINI_API_KEYS, data.GEMINI_API_KEY);
  const groqCreds = parseCredentialsFromEnv('groq', data.GROQ_API_KEYS, data.GROQ_API_KEY);
  const openrouterCreds = parseCredentialsFromEnv(
    'openrouter',
    data.OPENROUTER_API_KEYS,
    data.OPENROUTER_API_KEY
  );
  const cloudflareCreds = parseCredentialsFromEnv(
    'cloudflare',
    data.CLOUDFLARE_CREDENTIALS,
    data.CLOUDFLARE_API_TOKEN,
    data.CLOUDFLARE_ACCOUNT_ID
  );
  const xaiCreds = parseCredentialsFromEnv('xai', data.XAI_API_KEYS, data.XAI_API_KEY);

  return {
    defaultProvider: data.AI_DEFAULT_PROVIDER,
    defaultTimeoutMs: data.AI_REQUEST_TIMEOUT_MS,
    failoverOrder:
      data.AI_FAILOVER_ORDER.length > 0 ? data.AI_FAILOVER_ORDER : AI_DEFAULT_FAILOVER_ORDER,
    workloads: {
      chat: {
        allowedProviders: ALLOWED_WORKLOAD_PROVIDERS.chat,
        defaultProvider: data.AI_CHAT_PROVIDER,
        defaultModel: data.AI_CHAT_MODEL,
        fallbackProviders: [],
      },
      analytics: {
        allowedProviders: ALLOWED_WORKLOAD_PROVIDERS.analytics,
        defaultProvider: data.AI_ANALYTICS_PROVIDER,
        defaultModel: data.AI_ANALYTICS_MODEL,
        fallbackProviders:
          data.AI_ANALYTICS_FALLBACK_PROVIDERS.length > 0
            ? data.AI_ANALYTICS_FALLBACK_PROVIDERS
            : ['openrouter', 'cloudflare'],
      },
    },
    providers: {
      gemini: {
        apiKey: geminiCreds[0]?.apiKey,
        credentials: geminiCreds,
        defaultModel: data.GEMINI_DEFAULT_MODEL,
      },
      groq: {
        apiKey: groqCreds[0]?.apiKey,
        credentials: groqCreds,
        defaultModel: data.GROQ_DEFAULT_MODEL,
      },
      openrouter: {
        apiKey: openrouterCreds[0]?.apiKey,
        credentials: openrouterCreds,
        defaultModel: data.OPENROUTER_DEFAULT_MODEL,
      },
      cloudflare: {
        apiKey: cloudflareCreds[0]?.apiKey,
        accountId: data.CLOUDFLARE_ACCOUNT_ID,
        credentials: cloudflareCreds,
        defaultModel: data.CLOUDFLARE_DEFAULT_MODEL,
      },
      xai: {
        apiKey: xaiCreds[0]?.apiKey,
        credentials: xaiCreds,
        defaultModel: data.XAI_DEFAULT_MODEL,
      },
    },
  };
}
