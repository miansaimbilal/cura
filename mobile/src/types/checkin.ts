export type CheckinType = 'morning' | 'evening';

export interface CheckinOccurrence {
  id: string;
  userId: string;
  checkinType: CheckinType;
  localDate: string;
  conversationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GetOrCreateCheckinInput {
  userId?: string;
  checkinType: CheckinType;
  localDate: string;
}

export interface CheckinPreferences {
  morningEnabled: boolean;
  morningTime: string; // "HH:mm"
  eveningEnabled: boolean;
  eveningTime: string; // "HH:mm"
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "HH:mm"
  quietHoursEnd: string; // "HH:mm"
}
