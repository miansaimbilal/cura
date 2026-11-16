import {
  createAdminToken,
  deleteWaitlistEntry,
  getStorageMode,
  isDefaultAdminPassword,
  listWaitlistEntries,
  verifyAdminPassword,
  verifyAdminToken,
} from '../lib/store.mjs';

function extractBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return '';
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // POST: Admin login -> returns signed session token
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      if (!verifyAdminPassword(body.password)) {
        return res.status(401).json({ error: 'Incorrect admin password.' });
      }
      return res.status(200).json({
        success: true,
        token: createAdminToken(),
        usingDefaultPassword: isDefaultAdminPassword(),
      });
    } catch {
      return res.status(400).json({ error: 'Invalid request body.' });
    }
  }

  // All other methods require valid Admin token
  const token = extractBearerToken(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
  }

  if (req.method === 'GET') {
    try {
      const entries = await listWaitlistEntries();
      return res.status(200).json({
        entries,
        storageMode: getStorageMode(),
        usingDefaultPassword: isDefaultAdminPassword(),
      });
    } catch (err) {
      console.error('[admin-waitlist] Failed to fetch entries:', err);
      return res.status(500).json({ error: 'Failed to load waitlist entries.' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const email = body.email || req.query?.email;
      const deleted = await deleteWaitlistEntry(email);
      if (!deleted) {
        return res.status(404).json({ error: 'Entry not found.' });
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[admin-waitlist] Failed to delete entry:', err);
      return res.status(500).json({ error: 'Failed to delete entry.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
