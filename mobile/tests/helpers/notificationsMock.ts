export const SchedulableTriggerInputTypes = {
  DATE: 'date',
  TIME_INTERVAL: 'timeInterval',
  CALENDAR: 'calendar',
} as const;

let scheduledList: any[] = [];
let permissionState = 'granted';
let lastResponse: any = null;
const listeners = new Set<(response: any) => void>();

export const setNotificationHandler = (_handler: any) => {};

export const getPermissionsAsync = async () => ({
  status: permissionState,
  granted: permissionState === 'granted',
});

export const requestPermissionsAsync = async () => ({
  status: permissionState,
  granted: permissionState === 'granted',
});

export const getAllScheduledNotificationsAsync = async () => {
  return [...scheduledList];
};

export const cancelScheduledNotificationAsync = async (identifier: string) => {
  scheduledList = scheduledList.filter((n) => n.identifier !== identifier);
};

export const scheduleNotificationAsync = async (request: any) => {
  const identifier = `mock-notif-${Math.random().toString(36).substring(2, 9)}`;
  scheduledList.push({ identifier, ...request });
  return identifier;
};

export const getLastNotificationResponseAsync = async () => {
  return lastResponse;
};

export const addNotificationResponseReceivedListener = (listener: (response: any) => void) => {
  listeners.add(listener);
  return {
    remove: () => listeners.delete(listener),
  };
};

export const __mockHelpers = {
  reset: (initial: any[] = [], perm = 'granted', resp: any = null) => {
    scheduledList = [...initial];
    permissionState = perm;
    lastResponse = resp;
    listeners.clear();
  },
  getScheduled: () => [...scheduledList],
  triggerNotificationResponse: (response: any) => {
    for (const listener of listeners) {
      listener(response);
    }
  },
};

export default {
  SchedulableTriggerInputTypes,
  setNotificationHandler,
  getPermissionsAsync,
  requestPermissionsAsync,
  getAllScheduledNotificationsAsync,
  cancelScheduledNotificationAsync,
  scheduleNotificationAsync,
  getLastNotificationResponseAsync,
  addNotificationResponseReceivedListener,
  __mockHelpers,
};
