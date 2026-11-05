import type {
  AIProviderCredential,
  AIProviderId,
  CredentialSummary,
  ProviderCredentialStats,
} from './types';

export class CredentialPool {
  private readonly credentials: AIProviderCredential[];

  constructor(
    public readonly provider: AIProviderId,
    initialCredentials: AIProviderCredential[] = []
  ) {
    this.credentials = [...initialCredentials];
  }

  /**
   * Adds a credential to the pool.
   */
  public addCredential(credential: AIProviderCredential): void {
    const existingIndex = this.credentials.findIndex((c) => c.id === credential.id);
    if (existingIndex >= 0) {
      this.credentials[existingIndex] = credential;
    } else {
      this.credentials.push(credential);
    }
  }

  /**
   * Selects an eligible credential for execution.
   * Eligible criteria: enabled, not quarantined, and not currently cooling down.
   * Balances requests across multiple keys using least-recently-used selection.
   * Respects the excludeIds set (to avoid re-attempting failed keys during the same request).
   */
  public getEligibleCredential(excludeIds: Set<string> = new Set()): AIProviderCredential | null {
    const now = Date.now();

    // Expire any elapsed cooldowns
    for (const cred of this.credentials) {
      if (cred.cooldownUntil && cred.cooldownUntil.getTime() <= now) {
        cred.cooldownUntil = null;
      }
    }

    const eligible = this.credentials.filter((c) => {
      if (!c.enabled || c.quarantined || excludeIds.has(c.id)) {
        return false;
      }
      if (c.cooldownUntil && c.cooldownUntil.getTime() > now) {
        return false;
      }
      return true;
    });

    if (eligible.length === 0) {
      return null;
    }

    // Pick least-recently used
    eligible.sort((a, b) => {
      const aTime = a.lastUsedAt ? a.lastUsedAt.getTime() : 0;
      const bTime = b.lastUsedAt ? b.lastUsedAt.getTime() : 0;
      return aTime - bTime;
    });

    const chosen = eligible[0];
    chosen.lastUsedAt = new Date();
    return chosen;
  }

  /**
   * If all active credentials are in cooldown, retrieves the credential whose cooldown expires earliest.
   * Enables recovery when a provider is directly invoked.
   */
  public getEarliestCooldownCredential(
    excludeIds: Set<string> = new Set()
  ): AIProviderCredential | null {
    const candidates = this.credentials.filter(
      (c) => c.enabled && !c.quarantined && !excludeIds.has(c.id)
    );
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      const aTime = a.cooldownUntil ? a.cooldownUntil.getTime() : 0;
      const bTime = b.cooldownUntil ? b.cooldownUntil.getTime() : 0;
      return aTime - bTime;
    });

    const chosen = candidates[0];
    chosen.lastUsedAt = new Date();
    return chosen;
  }

  /**
   * Marks a credential as successfully executed.
   */
  public markSuccess(id: string): void {
    const cred = this.credentials.find((c) => c.id === id);
    if (cred) {
      cred.cooldownUntil = null;
      cred.lastError = null;
    }
  }

  /**
   * Marks a credential as rate limited, applying cooldown respecting Retry-After.
   */
  public markRateLimited(id: string, retryAfterSeconds?: number): void {
    const cred = this.credentials.find((c) => c.id === id);
    if (cred) {
      const cooldownSec = retryAfterSeconds ? Math.min(Math.max(retryAfterSeconds, 5), 300) : 60;
      cred.cooldownUntil = new Date(Date.now() + cooldownSec * 1000);
      cred.lastError = {
        category: 'RATE_LIMITED',
        message: 'Provider rate limit exceeded. Credential in cooldown.',
        timestamp: new Date().toISOString(),
        retryAfterSeconds: cooldownSec,
      };
    }
  }

  /**
   * Marks a credential as quota exceeded, applying an extended cooldown.
   */
  public markQuotaExceeded(id: string, retryAfterSeconds?: number): void {
    const cred = this.credentials.find((c) => c.id === id);
    if (cred) {
      const cooldownSec = retryAfterSeconds ? Math.min(Math.max(retryAfterSeconds, 30), 3600) : 300;
      cred.cooldownUntil = new Date(Date.now() + cooldownSec * 1000);
      cred.lastError = {
        category: 'QUOTA_EXCEEDED',
        message: 'Provider quota exhausted or credit balance depleted.',
        timestamp: new Date().toISOString(),
        retryAfterSeconds: cooldownSec,
      };
    }
  }

  /**
   * Quarantines an invalid credential (e.g. 401 unauthorized or invalid API key).
   * Quarantined keys are disabled and excluded from future request attempts.
   */
  public quarantine(id: string, reason: string): void {
    const cred = this.credentials.find((c) => c.id === id);
    if (cred) {
      cred.quarantined = true;
      cred.enabled = false;
      cred.quarantineReason = reason;
      cred.lastError = {
        category: 'AUTHENTICATION_ERROR',
        message: `Quarantined: ${reason}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Returns whether this provider has at least one configured credential.
   */
  public isConfigured(): boolean {
    return this.credentials.length > 0;
  }

  /**
   * Returns whether this provider has at least one active, non-cooling-down credential.
   */
  public hasAvailable(): boolean {
    return this.getStats().active > 0;
  }

  /**
   * Returns aggregated credential stats without leaking secrets.
   */
  public getStats(): ProviderCredentialStats {
    const now = Date.now();
    let active = 0;
    let coolingDown = 0;
    let quarantined = 0;

    for (const cred of this.credentials) {
      if (cred.quarantined) {
        quarantined++;
      } else if (!cred.enabled) {
        // Disabled credentials counted in total
      } else if (cred.cooldownUntil && cred.cooldownUntil.getTime() > now) {
        coolingDown++;
      } else {
        active++;
      }
    }

    return {
      total: this.credentials.length,
      active,
      coolingDown,
      quarantined,
    };
  }

  /**
   * Returns safe summaries of credentials for admin diagnostics.
   * Never leaks raw API keys or tokens.
   */
  public getCredentialSummaries(): CredentialSummary[] {
    const now = Date.now();
    return this.credentials.map((c) => ({
      id: c.id,
      enabled: c.enabled,
      isAvailable: c.enabled && !c.quarantined && (!c.cooldownUntil || c.cooldownUntil.getTime() <= now),
      quarantined: Boolean(c.quarantined),
      cooldownUntil: c.cooldownUntil ? c.cooldownUntil.toISOString() : null,
      lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
      lastError: c.lastError
        ? {
            category: c.lastError.category,
            message: c.lastError.message,
            timestamp: c.lastError.timestamp,
          }
        : null,
    }));
  }

  /**
   * Retrieves the first non-quarantined credential, or first configured credential.
   * Useful for administrative model discovery requests.
   */
  public getFirstCredential(): AIProviderCredential | null {
    return (
      this.credentials.find((c) => c.enabled && !c.quarantined) ??
      this.credentials[0] ??
      null
    );
  }

  /**
   * Returns all credentials in the pool (for internal backend checks only).
   */
  public getAllCredentials(): readonly AIProviderCredential[] {
    return this.credentials;
  }

  /**
   * Earliest cooldown expiration among cooling-down credentials (in seconds from now).
   */
  public getNextCooldownSeconds(): number | undefined {
    const now = Date.now();
    let minTime: number | undefined;

    for (const cred of this.credentials) {
      if (cred.cooldownUntil && cred.cooldownUntil.getTime() > now) {
        const remaining = Math.ceil((cred.cooldownUntil.getTime() - now) / 1000);
        if (minTime === undefined || remaining < minTime) {
          minTime = remaining;
        }
      }
    }
    return minTime;
  }
}
