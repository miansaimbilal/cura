export const APP_CONFIG = {
  name: 'Cura',
  tagline: 'Your calm, AI-powered personal companion',
  version: '1.0.0',
};

export interface MoodDefinition {
  id: string;
  label: string;
  icon: string;
  colorKey: keyof import('../theme/colors').ColorTokens['moods'];
  description: string;
}

export const MOODS: MoodDefinition[] = [
  { id: 'happy', label: 'Happy', icon: 'sunny', colorKey: 'happy', description: 'Content, joyful, upbeat' },
  { id: 'calm', label: 'Calm', icon: 'leaf', colorKey: 'calm', description: 'Peaceful, relaxed, centered' },
  { id: 'excited', label: 'Excited', icon: 'sparkles', colorKey: 'excited', description: 'Energized, enthusiastic' },
  { id: 'okay', label: 'Okay', icon: 'remove-outline', colorKey: 'okay', description: 'Balanced, standard, neutral' },
  { id: 'tired', label: 'Tired', icon: 'battery-charging-outline', colorKey: 'tired', description: 'Low energy, fatigued' },
  { id: 'stressed', label: 'Stressed', icon: 'pulse-outline', colorKey: 'stressed', description: 'Overwhelmed, pressured' },
  { id: 'sad', label: 'Sad', icon: 'cloud-outline', colorKey: 'sad', description: 'Down, melancholy, hurting' },
  { id: 'anxious', label: 'Anxious', icon: 'alert-circle-outline', colorKey: 'anxious', description: 'Nervous, uneasy, racing thoughts' },
  { id: 'angry', label: 'Frustrated', icon: 'flame-outline', colorKey: 'angry', description: 'Irritated, upset, annoyed' },
];

export interface CountryResource {
  code: string;
  name: string;
  emergency: string;
  crisisLine: string;
  crisisName: string;
}

export const COUNTRY_RESOURCES: CountryResource[] = [
  { code: 'US', name: 'United States', emergency: '911', crisisLine: '988', crisisName: '988 Suicide & Crisis Lifeline' },
  { code: 'UK', name: 'United Kingdom', emergency: '999', crisisLine: '111 / 116 123', crisisName: 'NHS Mental Health / Samaritans' },
  { code: 'CA', name: 'Canada', emergency: '911', crisisLine: '988', crisisName: '988 Suicide Crisis Helpline' },
  { code: 'AU', name: 'Australia', emergency: '000', crisisLine: '13 11 14', crisisName: 'Lifeline Australia' },
  { code: 'EU', name: 'European Union', emergency: '112', crisisLine: '112', crisisName: 'European Emergency Number' },
];
