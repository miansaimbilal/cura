import { CredentialPool } from '../credentialPool';
import type { AIProviderCredential, AIProviderId } from '../types';
import { OpenAICompatibleProvider } from './openaiCompatible.base';

export class XAIProvider extends OpenAICompatibleProvider {
  public readonly id: AIProviderId = 'xai';
  public readonly name = 'xAI Grok';
  protected readonly endpointUrl = 'https://api.x.ai/v1/chat/completions';

  constructor(
    defaultModel?: string,
    credentialsOrKey?: string | AIProviderCredential[] | CredentialPool
  ) {
    super('xai', defaultModel, credentialsOrKey);
  }
}
