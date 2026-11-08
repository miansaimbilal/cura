import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl, getValidAccessToken } from './auth/authContext';

export const AI_SETTINGS_STORAGE_KEY = '@cura_ai_settings';

export interface AISettings {
  selectedProvider: 'gemini' | 'groq' | 'openrouter' | 'cloudflare' | 'xai';
  selectedModel: string;
  backgroundPriority: string[];
}

export interface ProviderHealthSummary {
  id: string;
  name: string;
  status: 'configured' | 'unconfigured' | 'cooling_down';
  cooldownRemainingSeconds: number;
  models: string[];
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  selectedProvider: 'gemini',
  selectedModel: 'gemini-1.5-flash',
  backgroundPriority: ['gemini', 'groq', 'openrouter', 'cloudflare', 'xai'],
};

export const PROVIDER_CATALOG: Record<
  string,
  { name: string; defaultModel: string; availableModels: string[] }
> = {
  gemini: {
    name: 'Google Gemini',
    defaultModel: 'gemini-1.5-flash',
    availableModels: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'],
  },
  groq: {
    name: 'Groq (Llama / Mixtral)',
    defaultModel: 'llama-3.3-70b-versatile',
    availableModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  },
  openrouter: {
    name: 'OpenRouter Multi-Model',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    availableModels: ['anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.3-70b-instruct'],
  },
  cloudflare: {
    name: 'Cloudflare Workers AI',
    defaultModel: '@cf/meta/llama-3.1-8b-instruct',
    availableModels: ['@cf/meta/llama-3.1-8b-instruct'],
  },
  xai: {
    name: 'xAI (Grok)',
    defaultModel: 'grok-beta',
    availableModels: ['grok-beta'],
  },
};

/**
 * Loads AI settings from local persistence, defaulted safely.
 */
export async function getAISettings(): Promise<AISettings> {
  try {
    const raw = await AsyncStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      selectedProvider: parsed.selectedProvider || DEFAULT_AI_SETTINGS.selectedProvider,
      selectedModel: parsed.selectedModel || DEFAULT_AI_SETTINGS.selectedModel,
      backgroundPriority: Array.isArray(parsed.backgroundPriority)
        ? parsed.backgroundPriority
        : DEFAULT_AI_SETTINGS.backgroundPriority,
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

/**
 * Persists AI settings to local storage.
 */
export async function saveAISettings(settings: AISettings): Promise<AISettings> {
  await AsyncStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  return settings;
}

/**
 * Fetches non-sensitive provider health & discovery status from backend /api/ai/status.
 * Returns local fallback overview if network is offline or unauthenticated.
 */
export async function fetchAIProviderStatus(): Promise<{
  isOnline: boolean;
  providers: ProviderHealthSummary[];
  defaultProvider: string;
}> {
  try {
    const token = await getValidAccessToken();
    const res = await fetch(`${getApiBaseUrl()}/api/ai/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (res.ok) {
      const data = await res.json();
      const overview = data?.data?.providers || [];
      const providers: ProviderHealthSummary[] = Object.keys(PROVIDER_CATALOG).map((pId) => {
        const found = overview.find((o: any) => o.provider === pId);
        return {
          id: pId,
          name: PROVIDER_CATALOG[pId].name,
          status: found?.status || 'configured',
          cooldownRemainingSeconds: found?.cooldownRemainingSeconds || 0,
          models: PROVIDER_CATALOG[pId].availableModels,
        };
      });
      return {
        isOnline: true,
        providers,
        defaultProvider: data?.data?.defaultProvider || 'gemini',
      };
    }
  } catch {
    // Offline fallback
  }

  // Graceful offline fallback
  const fallbackProviders: ProviderHealthSummary[] = Object.keys(PROVIDER_CATALOG).map((pId) => ({
    id: pId,
    name: PROVIDER_CATALOG[pId].name,
    status: 'configured',
    cooldownRemainingSeconds: 0,
    models: PROVIDER_CATALOG[pId].availableModels,
  }));

  return {
    isOnline: false,
    providers: fallbackProviders,
    defaultProvider: 'gemini',
  };
}
