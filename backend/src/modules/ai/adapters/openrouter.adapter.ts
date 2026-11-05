import { CredentialPool } from '../credentialPool';
import type { AIProviderCredential, AIProviderId } from '../types';
import { OpenAICompatibleProvider } from './openaiCompatible.base';

export class OpenRouterProvider extends OpenAICompatibleProvider {
  public readonly id: AIProviderId = 'openrouter';
  public readonly name = 'OpenRouter';
  protected readonly endpointUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor(
    defaultModel?: string,
    credentialsOrKey?: string | AIProviderCredential[] | CredentialPool
  ) {
    super('openrouter', defaultModel, credentialsOrKey);
  }

  protected override getExtraHeaders(): Record<string, string> {
    return {
      'HTTP-Referer': 'https://cura.app',
      'X-Title': 'Cura',
    };
  }
}
