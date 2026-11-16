import { addWaitlistEntry, isValidEmail } from '../lib/store.mjs';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { email, source } = body;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const result = await addWaitlistEntry({ email, source });
    return res.status(result.alreadyExists ? 200 : 201).json({
      success: true,
      alreadyExists: result.alreadyExists,
      entry: result.entry,
    });
  } catch (err) {
    console.error('[waitlist] Failed to save entry:', err);
    return res.status(500).json({ error: 'Could not save your spot right now. Please try again.' });
  }
}
