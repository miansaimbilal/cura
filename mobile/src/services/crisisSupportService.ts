import { Linking } from 'react-native';

export interface CrisisHelpline {
  id: string;
  name: string;
  serviceType: 'emergency' | 'mental_health' | 'counseling' | 'text_support';
  contact: string;
  contactType: 'phone' | 'text' | 'url';
  description: string;
  hours: string;
  availableLocation: string;
}

export interface CountryCrisisDirectory {
  countryCode: 'PK' | 'US' | 'GB' | 'INT';
  countryName: string;
  emergencyNumber: string;
  helplines: CrisisHelpline[];
}

export const CRISIS_DIRECTORIES: Record<string, CountryCrisisDirectory> = {
  PK: {
    countryCode: 'PK',
    countryName: 'Pakistan',
    emergencyNumber: '1122',
    helplines: [
      {
        id: 'pk_rescue_1122',
        name: 'Rescue 1122 Emergency',
        serviceType: 'emergency',
        contact: '1122',
        contactType: 'phone',
        description: 'Government emergency ambulance, medical rescue, and fire service in Punjab & nationwide.',
        hours: '24/7',
        availableLocation: 'Nationwide (Faisalabad, Lahore, Rawalpindi, etc.)',
      },
      {
        id: 'pk_police_15',
        name: 'Police Emergency (Madadgar)',
        serviceType: 'emergency',
        contact: '15',
        contactType: 'phone',
        description: 'National police emergency response for immediate protection or physical safety.',
        hours: '24/7',
        availableLocation: 'Nationwide',
      },
      {
        id: 'pk_edhi_115',
        name: 'Edhi Ambulance Service',
        serviceType: 'emergency',
        contact: '115',
        contactType: 'phone',
        description: 'Emergency ambulance network and immediate medical transport.',
        hours: '24/7',
        availableLocation: 'Nationwide',
      },
      {
        id: 'pk_umang',
        name: 'Umang Mental Health Helpline',
        serviceType: 'mental_health',
        contact: '03117786264',
        contactType: 'phone',
        description: 'First formal 24/7 mental health crisis helpline in Pakistan staffed by qualified psychologists.',
        hours: '24/7',
        availableLocation: 'Nationwide (Call / WhatsApp: 0311-77UMANG)',
      },
      {
        id: 'pk_rozan',
        name: 'Rozan Emotional Counseling',
        serviceType: 'counseling',
        contact: '080022444',
        contactType: 'phone',
        description: 'Free toll-free telephone counseling and psychological support.',
        hours: 'Mon-Sat 10:00 AM – 6:00 PM',
        availableLocation: 'Nationwide (Toll-free 0800-22444)',
      },
    ],
  },
  US: {
    countryCode: 'US',
    countryName: 'United States',
    emergencyNumber: '911',
    helplines: [
      {
        id: 'us_988',
        name: '988 Suicide & Crisis Lifeline',
        serviceType: 'mental_health',
        contact: '988',
        contactType: 'phone',
        description: 'Free and confidential support for individuals in suicidal crisis or emotional distress.',
        hours: '24/7',
        availableLocation: 'United States',
      },
      {
        id: 'us_crisis_text',
        name: 'Crisis Text Line',
        serviceType: 'text_support',
        contact: '741741',
        contactType: 'text',
        description: 'Free crisis counseling via text messaging (Text HOME to 741741).',
        hours: '24/7',
        availableLocation: 'United States',
      },
      {
        id: 'us_911',
        name: 'Emergency Services',
        serviceType: 'emergency',
        contact: '911',
        contactType: 'phone',
        description: 'Immediate police, ambulance, or fire department assistance.',
        hours: '24/7',
        availableLocation: 'United States',
      },
    ],
  },
  GB: {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    emergencyNumber: '999',
    helplines: [
      {
        id: 'gb_samaritans',
        name: 'Samaritans Helpline',
        serviceType: 'mental_health',
        contact: '116123',
        contactType: 'phone',
        description: 'Confidential emotional support for anyone experiencing feelings of distress or despair.',
        hours: '24/7',
        availableLocation: 'UK & Northern Ireland',
      },
      {
        id: 'gb_shout',
        name: 'Shout Crisis Text Line',
        serviceType: 'text_support',
        contact: '85258',
        contactType: 'text',
        description: 'Free, confidential, 24/7 text support service (Text SHOUT to 85258).',
        hours: '24/7',
        availableLocation: 'United Kingdom',
      },
      {
        id: 'gb_999',
        name: 'Emergency Services',
        serviceType: 'emergency',
        contact: '999',
        contactType: 'phone',
        description: 'Police, ambulance, or fire service for immediate life-threatening situations.',
        hours: '24/7',
        availableLocation: 'United Kingdom',
      },
    ],
  },
  INT: {
    countryCode: 'INT',
    countryName: 'International Directory',
    emergencyNumber: '112',
    helplines: [
      {
        id: 'int_befrienders',
        name: 'Befrienders Worldwide',
        serviceType: 'mental_health',
        contact: 'https://www.befrienders.org',
        contactType: 'url',
        description: 'Global emotional support network operating across 32 countries.',
        hours: 'Directory / Varies by country',
        availableLocation: 'Worldwide',
      },
      {
        id: 'int_iasp',
        name: 'International Association for Suicide Prevention (IASP)',
        serviceType: 'mental_health',
        contact: 'https://www.iasp.info/resources/Crisis_Centres/',
        contactType: 'url',
        description: 'Comprehensive directory of crisis centers and national crisis lines worldwide.',
        hours: 'Online Directory',
        availableLocation: 'Worldwide',
      },
    ],
  },
};

export const CRISIS_DISCLAIMER_TEXT =
  'Crisis helpline details are provided for informational and supportive guidance. Please verify emergency numbers locally in your jurisdiction. Cura is an AI wellbeing companion and does not provide clinical diagnosis, psychiatric medical treatment, or real-time emergency monitoring.';

export const TRUSTED_PERSON_PROMPT =
  'If you feel overwhelmed, in despair, or unsafe, please reach out right now to a trusted family member, close friend, or qualified healthcare professional. You do not have to carry this alone.';

/**
 * Returns the crisis directory for a specified country code, defaulting to Pakistan.
 */
export function getCrisisDirectory(countryCode: string = 'PK'): CountryCrisisDirectory {
  const normalized = countryCode.toUpperCase();
  return CRISIS_DIRECTORIES[normalized] ?? CRISIS_DIRECTORIES.PK;
}

/**
 * Initiates contact (phone call, SMS, or web link) with safety checks.
 */
export async function triggerCrisisContact(helpline: CrisisHelpline): Promise<void> {
  try {
    let url = '';
    if (helpline.contactType === 'phone') {
      url = `tel:${helpline.contact}`;
    } else if (helpline.contactType === 'text') {
      url = `sms:${helpline.contact}`;
    } else if (helpline.contactType === 'url') {
      url = helpline.contact;
    }
    if (url) {
      await Linking.openURL(url);
    }
  } catch (err) {
    console.warn('[crisisSupportService] Unable to open link:', helpline.contact, err);
  }
}
