type AppStateListener = (state: string) => void;
const listeners = new Set<AppStateListener>();

export const AppState = {
  currentState: 'active',
  addEventListener: (_event: string, listener: AppStateListener) => {
    listeners.add(listener);
    return {
      remove: () => {
        listeners.delete(listener);
      },
    };
  },
  __emitStateChange: (newState: string) => {
    AppState.currentState = newState;
    listeners.forEach((l) => l(newState));
  },
  __getListenerCount: () => listeners.size,
  __clearListeners: () => listeners.clear(),
};

export const Platform = {
  OS: 'android',
  select: (obj: any) => obj.android ?? obj.default,
};

export default {
  AppState,
  Platform,
};
