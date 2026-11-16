import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email.trim());
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || 'cura-admin-2026';
}

export function isDefaultAdminPassword() {
  return !process.env.ADMIN_PASSWORD;
}

function getSigningSecret() {
  return process.env.ADMIN_TOKEN_SECRET || `cura_hmac_${getAdminPassword()}`;
}

export function createAdminToken() {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded && decoded.role === 'admin' && typeof decoded.exp === 'number' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

export function verifyAdminPassword(input) {
  if (typeof input !== 'string') return false;
  const expected = getAdminPassword();
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ============================================================================
   STORAGE BACKENDS
   Priority:
   1. Upstash / Vercel KV REST API (KV_REST_API_URL + KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
   2. Supabase REST API (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) -> table "waitlist_signups"
   3. File JSON Storage (WAITLIST_DATA_DIR/waitlist.json -> ./data/waitlist.json -> /tmp/cura-waitlist.json on read-only serverless)
   ============================================================================ */

function getKVConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url: url.replace(/\/$/, ''), token };
  return null;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return { url: url.replace(/\/$/, ''), key };
  return null;
}

export function getStorageMode() {
  if (getKVConfig()) return 'Vercel KV / Upstash Redis';
  if (getSupabaseConfig()) return 'Supabase Database';
  if (process.env.VERCEL) return 'Serverless Temp (/tmp) — connect KV or Supabase for permanent cloud persistence';
  return 'Local JSON File (data/waitlist.json)';
}

const KV_HASH_KEY = 'cura:waitlist:entries';

async function kvCommand(args) {
  const cfg = getKVConfig();
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(`KV error: ${res.status}`);
  }
  return res.json();
}

async function resolveFilePath() {
  const preferredDir = process.env.WAITLIST_DATA_DIR
    ? path.resolve(process.env.WAITLIST_DATA_DIR)
    : process.env.VERCEL
      ? '/tmp'
      : path.resolve(process.cwd(), 'data');

  try {
    await fs.mkdir(preferredDir, { recursive: true });
    return path.join(preferredDir, 'waitlist.json');
  } catch {
    const fallbackDir = '/tmp';
    await fs.mkdir(fallbackDir, { recursive: true });
    return path.join(fallbackDir, 'waitlist.json');
  }
}

async function readLocalEntries() {
  const filePath = await resolveFilePath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalEntries(entries) {
  const filePath = await resolveFilePath();
  await fs.writeFile(filePath, JSON.stringify(entries, null, 2), 'utf8');
}

export async function addWaitlistEntry({ email, source = 'hero' }) {
  const cleanEmail = normalizeEmail(email);
  const cleanSource = source === 'footer' ? 'footer' : 'hero';
  const entry = {
    id: crypto.randomUUID(),
    email: cleanEmail,
    source: cleanSource,
    createdAt: new Date().toISOString(),
  };

  // 1. Upstash / Vercel KV
  if (getKVConfig()) {
    const existing = await kvCommand(['HGET', KV_HASH_KEY, cleanEmail]);
    if (existing && existing.result) {
      return { entry: JSON.parse(existing.result), alreadyExists: true };
    }
    await kvCommand(['HSET', KV_HASH_KEY, cleanEmail, JSON.stringify(entry)]);
    return { entry, alreadyExists: false };
  }

  // 2. Supabase REST
  const sb = getSupabaseConfig();
  if (sb) {
    const checkRes = await fetch(
      `${sb.url}/rest/v1/waitlist_signups?email=eq.${encodeURIComponent(cleanEmail)}&select=*`,
      {
        headers: {
          apikey: sb.key,
          Authorization: `Bearer ${sb.key}`,
        },
      }
    );
    const existingRows = checkRes.ok ? await checkRes.json() : [];
    if (Array.isArray(existingRows) && existingRows.length > 0) {
      return {
        entry: {
          id: existingRows[0].id,
          email: existingRows[0].email,
          source: existingRows[0].source || 'hero',
          createdAt: existingRows[0].created_at || existingRows[0].createdAt,
        },
        alreadyExists: true,
      };
    }

    const insertRes = await fetch(`${sb.url}/rest/v1/waitlist_signups`, {
      method: 'POST',
      headers: {
        apikey: sb.key,
        Authorization: `Bearer ${sb.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        id: entry.id,
        email: entry.email,
        source: entry.source,
        created_at: entry.createdAt,
      }),
    });
    if (!insertRes.ok) {
      throw new Error(`Supabase insert failed: ${insertRes.status}`);
    }
    return { entry, alreadyExists: false };
  }

  // 3. Local JSON File
  const entries = await readLocalEntries();
  const existing = entries.find((item) => item.email === cleanEmail);
  if (existing) {
    return { entry: existing, alreadyExists: true };
  }
  entries.unshift(entry);
  await writeLocalEntries(entries);
  return { entry, alreadyExists: false };
}

export async function listWaitlistEntries() {
  // 1. Upstash / Vercel KV
  if (getKVConfig()) {
    const data = await kvCommand(['HVALS', KV_HASH_KEY]);
    const rawList = Array.isArray(data?.result) ? data.result : [];
    return rawList
      .map((item) => {
        try {
          return JSON.parse(item);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // 2. Supabase REST
  const sb = getSupabaseConfig();
  if (sb) {
    const res = await fetch(`${sb.url}/rest/v1/waitlist_signups?select=*&order=created_at.desc`, {
      headers: {
        apikey: sb.key,
        Authorization: `Bearer ${sb.key}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Supabase fetch failed: ${res.status}`);
    }
    const rows = await res.json();
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      id: row.id,
      email: row.email,
      source: row.source || 'hero',
      createdAt: row.created_at || row.createdAt,
    }));
  }

  // 3. Local JSON File
  const entries = await readLocalEntries();
  return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function deleteWaitlistEntry(email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return false;

  if (getKVConfig()) {
    const res = await kvCommand(['HDEL', KV_HASH_KEY, cleanEmail]);
    return Number(res?.result || 0) > 0;
  }

  const sb = getSupabaseConfig();
  if (sb) {
    const res = await fetch(
      `${sb.url}/rest/v1/waitlist_signups?email=eq.${encodeURIComponent(cleanEmail)}`,
      {
        method: 'DELETE',
        headers: {
          apikey: sb.key,
          Authorization: `Bearer ${sb.key}`,
        },
      }
    );
    return res.ok;
  }

  const entries = await readLocalEntries();
  const next = entries.filter((item) => item.email !== cleanEmail);
  if (next.length === entries.length) return false;
  await writeLocalEntries(next);
  return true;
}
