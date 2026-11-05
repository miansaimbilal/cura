import { CredentialPool } from '../credentialPool';
import type { AIProviderCredential, AIProviderId } from '../types';
import { OpenAICompatibleProvider } from './openaiCompatible.base';

export class GroqProvider extends OpenAICompatibleProvider {
  public readonly id: AIProviderId = 'groq';
  public readonly name = 'Groq';
  protected readonly endpointUrl = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(
    defaultModel?: string,
    credentialsOrKey?: string | AIProviderCredential[] | CredentialPool
  ) {
    super('groq', defaultModel, credentialsOrKey);
  }
}
