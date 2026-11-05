import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { getAIRegistry } from './registry';
import type { AIProviderId, AIProviderModelDiscovery } from './types';

export const aiRouter = Router();

/**
 * GET /api/ai/status
 * Authenticated endpoint returning non-sensitive provider health, configuration status,
 * and current cooldown states. Does not execute paid API calls.
 */
aiRouter.get('/status', authenticate, (_req, res) => {
  const registry = getAIRegistry();
  const config = registry.getConfig();
  const healthOverview = registry.getHealthOverview();

  res.status(200).json({
    success: true,
    data: {
      defaultProvider: config.defaultProvider,
      defaultTimeoutMs: config.defaultTimeoutMs,
      failoverOrder: config.failoverOrder,
      workloads: config.workloads,
      providers: healthOverview,
    },
  });
});

/**
 * GET /api/ai/models
 * Authenticated endpoint discovering available models for a given provider (or all configured providers).
 * Uses backend credentials safely without exposing API keys or secrets.
 * Clearly reports discovery status ('discovered' vs 'fallback_unverified') so unverified defaults
 * are not misrepresented as verified live models.
 */
aiRouter.get('/models', authenticate, async (req, res) => {
  const registry = getAIRegistry();
  const requestedProvider = req.query.provider as string | undefined;
  const requestedWorkload = req.query.workload as string | undefined;

  const validProviders: AIProviderId[] = ['gemini', 'groq', 'openrouter', 'cloudflare', 'xai'];
  const validWorkloads = ['chat', 'analytics'];

  if (requestedWorkload && !validWorkloads.includes(requestedWorkload)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: `Invalid workload "${requestedWorkload}". Supported workloads: chat, analytics.`,
      },
    });
    return;
  }

  const allowedForWorkload: AIProviderId[] | null = requestedWorkload
    ? registry.getConfig().workloads[requestedWorkload as 'chat' | 'analytics'].allowedProviders
    : null;

  if (requestedProvider) {
    if (!validProviders.includes(requestedProvider as AIProviderId)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: `Invalid provider "${requestedProvider}". Supported providers: ${validProviders.join(', ')}`,
        },
      });
      return;
    }

    if (allowedForWorkload && !allowedForWorkload.includes(requestedProvider as AIProviderId)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_CAPABILITY',
          message: `Provider "${requestedProvider}" is not permitted for workload "${requestedWorkload}". Allowed: ${allowedForWorkload.join(', ')}`,
        },
      });
      return;
    }

    const forceRefresh = req.query.refresh === 'true' || req.query.refresh === '1';
    const provider = registry.getProvider(requestedProvider as AIProviderId);
    const discovery = provider.listAvailableModels
      ? await provider.listAvailableModels(forceRefresh)
      : {
          provider: requestedProvider as AIProviderId,
          status: 'fallback_unverified' as const,
          models: provider.getHealth().defaultModel
            ? [{ id: provider.getHealth().defaultModel!, provider: requestedProvider as AIProviderId, isDefault: true }]
            : [],
        };

    res.status(200).json({
      success: true,
      data: {
        provider: requestedProvider,
        workload: requestedWorkload,
        status: discovery.status,
        models: discovery.models,
        ...(discovery.error && { error: discovery.error }),
      },
    });
    return;
  }

  // If no provider specified, discover models for configured providers (filtered by workload if requested)
  const forceRefresh = req.query.refresh === 'true' || req.query.refresh === '1';
  const configuredProviders = registry.getConfiguredProviders().filter((p) => {
    return !allowedForWorkload || allowedForWorkload.includes(p.id);
  });
  const allDiscoveries: Record<string, AIProviderModelDiscovery> = {};

  for (const provider of configuredProviders) {
    if (provider.listAvailableModels) {
      allDiscoveries[provider.id] = await provider.listAvailableModels(forceRefresh);
    }
  }

  res.status(200).json({
    success: true,
    data: {
      workload: requestedWorkload,
      defaultProvider: requestedWorkload
        ? registry.getConfig().workloads[requestedWorkload as 'chat' | 'analytics'].defaultProvider
        : registry.getConfig().defaultProvider,
      discoveryByProvider: allDiscoveries,
    },
  });
});

