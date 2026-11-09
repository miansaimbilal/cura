import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform, ToastAndroid, Alert, AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getDatabase } from '../../db/client';
import { IDatabase } from '../../db/types';
import { getAllTasks } from '../../db/taskRepository';
import { getAllMoodEntries } from '../../db/moodRepository';
import { migrateGuestDataToUser, transitionAccountEpoch, EpochTransitionOptions } from './sessionService';

export interface UserSession {
  userId: string;
  email: string | null;
  isGuest: boolean;
}

export interface AuthContextValue extends UserSession {
  isLoading: boolean;
  isAuthLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; user?: any; error?: string }>;
  register: (email: string, password: string) => Promise<{ success: boolean; user?: any; error?: string }>;
  logout: () => Promise<void>;
}

export interface AuthActionOptions extends EpochTransitionOptions {
  db?: IDatabase;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const ACCESS_TOKEN_KEY = 'cura_access_token';
export const REFRESH_TOKEN_KEY = 'cura_refresh_token';
export const USER_INFO_KEY = 'cura_user_info';

export const getApiBaseUrl = (): string => {
  return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
};

// Global session expired callback for non-React contexts
let onSessionExpiredListener: (() => void) | null = null;

export function setSessionExpiredListener(listener: (() => void) | null) {
  onSessionExpiredListener = listener;
}

/**
 * Universal base64 decoder that works across Node.js, Web, and React Native (Hermes/JSC).
 */
function base64Decode(str: string): string {
  if (typeof atob === 'function') {
    return atob(str);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'base64').toString('utf-8');
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  const input = String(str).replace(/=+$/, '');
  for (
    let bc = 0, bs = 0, buffer, idx = 0;
    (buffer = input.charAt(idx++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}

/**
 * Decodes the expiration timestamp (exp in seconds) from a standard JWT without external libraries.
 */
export function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const jsonStr = base64Decode(base64);
    const parsed = JSON.parse(jsonStr);
    return typeof parsed.exp === 'number' ? parsed.exp : null;
  } catch {
    return null;
  }
}

/**
 * Checks whether a JWT is expired or expiring within skewSeconds (default 60s).
 */
export function isTokenExpired(token: string, skewSeconds: number = 60): boolean {
  const exp = decodeJwtExp(token);
  if (exp === null) {
    return false;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  return exp <= nowSeconds + skewSeconds;
}

export function showSessionExpiredNotice() {
  try {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    if (Platform.OS === 'android' && ToastAndroid && typeof ToastAndroid.show === 'function') {
      ToastAndroid.show('Session expired, please sign in again', ToastAndroid.SHORT);
    } else if (Alert && typeof Alert.alert === 'function') {
      Alert.alert('Session Expired', 'Session expired, please sign in again');
    }
  } catch {
    // Non-UI or test environment fallback
  }
}

export function navigateToGuestHome() {
  try {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { router } = require('expo-router');
    if (router && typeof router.replace === 'function') {
      router.replace('/(tabs)/home');
    }
  } catch {
    // Safe when router is not available
  }
}

export async function handleSessionExpired(options: { onSessionExpired?: () => void } = {}) {
  await clearStoredTokens();

  if (options.onSessionExpired) {
    options.onSessionExpired();
  } else if (onSessionExpiredListener) {
    onSessionExpiredListener();
  }

  showSessionExpiredNotice();
  navigateToGuestHome();
}

export async function getStoredTokens() {
  try {
    const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    const userInfoRaw = await SecureStore.getItemAsync(USER_INFO_KEY);
    let user = null;
    if (userInfoRaw) {
      try {
        user = JSON.parse(userInfoRaw);
      } catch {
        user = null;
      }
    }
    return { accessToken, refreshToken, user };
  } catch {
    return { accessToken: null, refreshToken: null, user: null };
  }
}

export async function storeTokens(
  accessToken: string,
  refreshToken: string,
  user: { id: string; email: string }
) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  await SecureStore.setItemAsync(USER_INFO_KEY, JSON.stringify(user));
}

export async function clearStoredTokens() {
  try {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_INFO_KEY);
  } catch {
    // Ignore error
  }
}

/**
 * Returns a valid access token.
 * Refreshes token if expired or within 60s of expiring.
 * On refresh failure (401 / invalid token), clears tokens, notifies listeners, and returns null.
 */
export async function getValidAccessToken(options: {
  forceRefresh?: boolean;
  onSessionExpired?: () => void;
  db?: IDatabase;
} = {}): Promise<string | null> {
  const { accessToken, refreshToken } = await getStoredTokens();

  if (!accessToken && !refreshToken) {
    return null;
  }

  // If accessToken exists, is not forceRefreshed, and has >=60s left, return it directly
  if (accessToken && !options.forceRefresh && !isTokenExpired(accessToken, 60)) {
    return accessToken;
  }

  // Refresh needed
  if (!refreshToken) {
    await handleSessionExpired(options);
    return null;
  }

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success || !data?.data?.accessToken) {
      // 401 or invalid refresh token -> session expired
      await handleSessionExpired(options);
      return null;
    }

    const newAccessToken = data.data.accessToken;
    const newRefreshToken = data.data.refreshToken || refreshToken;

    const { user } = await getStoredTokens();
    if (user?.id) {
      await storeTokens(newAccessToken, newRefreshToken, user);
    } else {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, newAccessToken);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, newRefreshToken);
    }

    // Trigger sync retry after refresh success
    if (user?.id) {
      retryPendingBatchMigration(user.id, { db: options.db }).catch(() => {});
    }

    return newAccessToken;
  } catch {
    // Network offline: do not wipe session on transient offline, return null
    return null;
  }
}

/**
 * Cold-start session restorer.
 * Reads SecureStore:
 * - If all tokens + user info present: returns authenticated session. Does NOT bump epoch, does NOT migrate data.
 * - If missing or corrupt: returns guest session without crashing.
 */
export async function restoreSession(): Promise<{
  session: UserSession;
  isValid: boolean;
}> {
  try {
    const { accessToken, refreshToken, user } = await getStoredTokens();
    if (accessToken && refreshToken && user?.id) {
      return {
        session: {
          userId: user.id,
          email: user.email ?? null,
          isGuest: false,
        },
        isValid: true,
      };
    }
    return {
      session: {
        userId: 'guest',
        email: null,
        isGuest: true,
      },
      isValid: false,
    };
  } catch {
    return {
      session: {
        userId: 'guest',
        email: null,
        isGuest: true,
      },
      isValid: false,
    };
  }
}

let isRetryingSync = false;

/**
 * Retries a pending batch_migration entry from sync_outbox.
 * Non-blocking, single execution guard, handles 401 with token refresh + single retry.
 */
export async function retryPendingBatchMigration(
  userId?: string,
  options: {
    db?: IDatabase;
    fetchFn?: typeof fetch;
    getValidTokenFn?: () => Promise<string | null>;
  } = {}
): Promise<{ retried: boolean; success?: boolean; reason?: string }> {
  if (isRetryingSync) {
    return { retried: false, reason: 'Already in progress' };
  }

  isRetryingSync = true;
  try {
    const db = options.db || (await getDatabase());
    const targetUserId = userId || (await getStoredTokens()).user?.id;

    if (!targetUserId || targetUserId === 'guest') {
      return { retried: false, reason: 'No authenticated user' };
    }

    // Query sync_outbox for batch_migration row
    const row = await db.getFirstAsync<{
      client_sequence: number;
      mutation_id: string;
      user_id: string;
      payload: string;
    }>(
      `SELECT client_sequence, mutation_id, user_id, payload
       FROM sync_outbox
       WHERE entity_type = 'batch_migration' AND user_id = ?
       ORDER BY client_sequence ASC
       LIMIT 1;`,
      targetUserId
    );

    if (!row) {
      return { retried: false, reason: 'No pending batch migration' };
    }

    // Prepare payload
    let batchPayload: any;
    try {
      const parsed = JSON.parse(row.payload);
      if (parsed && parsed.entities) {
        batchPayload = parsed;
      } else {
        const tasks = await getAllTasks(db, { userId: targetUserId });
        const moods = await getAllMoodEntries(db, { userId: targetUserId });
        batchPayload = {
          batchId: row.mutation_id,
          clientMutationIds: [],
          entities: {
            tasks: tasks.map((t) => ({
              id: t.id,
              title: t.title,
              description: t.description || null,
              dueDate: t.dueDate || null,
              dueTime: t.dueTime || null,
              isTimed: Boolean(t.isTimed),
              status: t.status || 'pending',
              completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
              postponedAt: t.postponedAt ? new Date(t.postponedAt).toISOString() : null,
              createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
            })),
            moodEntries: moods.map((m) => ({
              id: m.id,
              moodType: m.moodType,
              note: m.note || null,
              tags: m.tags || [],
              loggedAt: m.loggedAt ? new Date(m.loggedAt).toISOString() : new Date().toISOString(),
              createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
            })),
          },
        };
      }
    } catch {
      return { retried: false, reason: 'Corrupt payload' };
    }

    const fetchImpl = options.fetchFn || globalThis.fetch;
    const getToken = options.getValidTokenFn || (() => getValidAccessToken({ db }));

    let token = await getToken();
    if (!token) {
      return { retried: true, success: false, reason: 'No valid token' };
    }

    // First attempt
    let res = await fetchImpl(`${getApiBaseUrl()}/api/v1/auth/migrate-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(batchPayload),
    }).catch(() => null);

    // On 401 -> trigger refresh + retry once
    if (res && res.status === 401) {
      token = await getValidAccessToken({ db, forceRefresh: true });
      if (token) {
        res = await fetchImpl(`${getApiBaseUrl()}/api/v1/auth/migrate-batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(batchPayload),
        }).catch(() => null);
      }
    }

    if (!res) {
      // Offline / network failure -> leave row, do nothing
      return { retried: true, success: false, reason: 'Network offline' };
    }

    if (res.ok) {
      // Success -> delete row from sync_outbox
      await db.runAsync(
        `DELETE FROM sync_outbox WHERE client_sequence = ?;`,
        row.client_sequence
      );
      return { retried: true, success: true };
    }

    // 500 or other failure -> leave row, do nothing
    return { retried: true, success: false, reason: `Server returned ${res.status}` };
  } catch (err: any) {
    return { retried: true, success: false, reason: err?.message || 'Unknown error' };
  } finally {
    isRetryingSync = false;
  }
}

export async function executePostAuthMigration(
  accessToken: string,
  user: { id: string; email: string },
  options: AuthActionOptions = {}
) {
  const db = options.db || (await getDatabase());

  // 1. Local SQLite guest migration (atomic + epoch advance)
  await migrateGuestDataToUser(db, user.id, options);

  // 2. Cloud batch migration to PostgreSQL backend
  try {
    const validToken = (await getValidAccessToken({ db })) || accessToken;
    const tasks = await getAllTasks(db, { userId: user.id });
    const moods = await getAllMoodEntries(db, { userId: user.id });

    const batchPayload = {
      batchId: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      clientMutationIds: [],
      entities: {
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description || null,
          dueDate: t.dueDate || null,
          dueTime: t.dueTime || null,
          isTimed: Boolean(t.isTimed),
          status: t.status || 'pending',
          completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
          postponedAt: t.postponedAt ? new Date(t.postponedAt).toISOString() : null,
          createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
        })),
        moodEntries: moods.map((m) => ({
          id: m.id,
          moodType: m.moodType,
          note: m.note || null,
          tags: m.tags || [],
          loggedAt: m.loggedAt ? new Date(m.loggedAt).toISOString() : new Date().toISOString(),
          createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
        })),
      },
    };

    const res = await fetch(`${getApiBaseUrl()}/api/v1/auth/migrate-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify(batchPayload),
    });

    if (!res.ok) {
      throw new Error(`Cloud batch migration responded with ${res.status}`);
    }
  } catch (syncErr) {
    console.warn('[authContext] Cloud batch migration failed (offline or network error); queueing in sync_outbox:', syncErr);
    // Local migration is committed; queue in sync_outbox so data is never lost
    try {
      const tasks = await getAllTasks(db, { userId: user.id });
      const moods = await getAllMoodEntries(db, { userId: user.id });
      const queuedBatch = {
        batchId: `outbox_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        clientMutationIds: [],
        entities: {
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description || null,
            dueDate: t.dueDate || null,
            dueTime: t.dueTime || null,
            isTimed: Boolean(t.isTimed),
            status: t.status || 'pending',
            completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
            postponedAt: t.postponedAt ? new Date(t.postponedAt).toISOString() : null,
            createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
          })),
          moodEntries: moods.map((m) => ({
            id: m.id,
            moodType: m.moodType,
            note: m.note || null,
            tags: m.tags || [],
            loggedAt: m.loggedAt ? new Date(m.loggedAt).toISOString() : new Date().toISOString(),
            createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
          })),
        },
      };

      await db.runAsync(
        `INSERT INTO sync_outbox (mutation_id, user_id, entity_type, entity_id, action, payload, created_at)
         VALUES (?, ?, 'batch_migration', ?, 'sync', ?, datetime('now'));`,
        queuedBatch.batchId,
        user.id,
        user.id,
        JSON.stringify(queuedBatch)
      );
    } catch (queueErr) {
      console.error('[authContext] Failed to queue sync_outbox entry:', queueErr);
    }
  }
}

export async function loginUser(
  email: string,
  password: string,
  options: AuthActionOptions = {}
): Promise<{ success: boolean; user?: any; error?: string }> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      const message =
        data?.error?.message ||
        data?.message ||
        (res.status === 401 ? 'Invalid email or password' : 'Login failed');
      return { success: false, error: message };
    }

    const { accessToken, refreshToken, user } = data.data;
    if (!accessToken || !user?.id) {
      return { success: false, error: 'Malformed response from auth server' };
    }

    // Store tokens in SecureStore
    await storeTokens(accessToken, refreshToken, user);

    // Execute migration + batch sync
    await executePostAuthMigration(accessToken, user, options);

    return { success: true, user };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error occurred during login' };
  }
}

export async function registerUser(
  email: string,
  password: string,
  options: AuthActionOptions = {}
): Promise<{ success: boolean; user?: any; error?: string }> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      const message = data?.error?.message || data?.message || 'Registration failed';
      return { success: false, error: message };
    }

    const { accessToken, refreshToken, user } = data.data;
    if (!accessToken || !user?.id) {
      return { success: false, error: 'Malformed response from auth server' };
    }

    // Store tokens in SecureStore
    await storeTokens(accessToken, refreshToken, user);

    // Execute migration + batch sync
    await executePostAuthMigration(accessToken, user, options);

    return { success: true, user };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error occurred during registration' };
  }
}

export async function logoutUser(options: AuthActionOptions = {}): Promise<void> {
  const db = options.db || (await getDatabase());
  try {
    const validToken = await getValidAccessToken({ db });
    const { refreshToken } = await getStoredTokens();
    if (validToken || refreshToken) {
      // Best-effort remote logout
      await fetch(`${getApiBaseUrl()}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(validToken ? { Authorization: `Bearer ${validToken}` } : {}),
        },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
  } finally {
    // 1. Delete tokens from SecureStore
    await clearStoredTokens();

    // 2. Transition account epoch to guest in SQLite and clear widget snapshots
    await transitionAccountEpoch(db, 'guest', options);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<UserSession>({
    userId: 'guest',
    email: null,
    isGuest: true,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Restore stored session on launch
  useEffect(() => {
    let isMounted = true;

    // Listen for session expiry from background token refresh failures
    setSessionExpiredListener(() => {
      if (isMounted) {
        setSession({
          userId: 'guest',
          email: null,
          isGuest: true,
        });
      }
    });

    restoreSession()
      .then(({ session: restored, isValid }) => {
        if (isMounted) {
          setSession(restored);
          setIsLoading(false);
          if (isValid && !restored.isGuest) {
            retryPendingBatchMigration(restored.userId).catch(() => {});
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setSession({
            userId: 'guest',
            email: null,
            isGuest: true,
          });
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
      setSessionExpiredListener(null);
    };
  }, []);

  // Listen to AppState foreground changes for sync retries
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && !session.isGuest && session.userId) {
        retryPendingBatchMigration(session.userId).catch(() => {});
      }
    });
    return () => {
      sub.remove();
    };
  }, [session.isGuest, session.userId]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await loginUser(email, password);
      if (result.success && result.user) {
        setSession({
          userId: result.user.id,
          email: result.user.email,
          isGuest: false,
        });
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await registerUser(email, password);
      if (result.success && result.user) {
        setSession({
          userId: result.user.id,
          email: result.user.email,
          isGuest: false,
        });
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await logoutUser();
      setSession({
        userId: 'guest',
        email: null,
        isGuest: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        ...session,
        isLoading,
        isAuthLoading: isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
