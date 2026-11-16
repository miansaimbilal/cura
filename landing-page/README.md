# Cura — Waitlist Landing Page & Admin Portal

Zero-dependency landing page + waitlist storage API + password-protected Admin Dashboard (`admin.html` / `/admin`), ready to deploy on **Render** or **Vercel**.

---

## Features Included

- **Landing Page (`/`)** — Saves emails via `POST /api/waitlist` when visitors click **Save My Spot →** or **Notify Me at Launch →**.
- **Admin Dashboard (`/admin`)** — Protected by `ADMIN_PASSWORD`. Lets you view all collected emails, see signup counts & source (`Hero` / `Footer`), search, copy all emails, export a CSV file, or remove entries.
- **Zero External Dependencies** — Pure Node.js + HTML/CSS/JS. Works with local JSON file storage (`data/waitlist.json`) or cloud storage on serverless hosts.

---

## Environment Variables

| Variable | Required | Description |
| :--- | :--- | :--- |
| `ADMIN_PASSWORD` | **Recommended** | Password for `/admin` (defaults to `cura-admin-2026` in dev if omitted). |
| `ADMIN_TOKEN_SECRET` | Optional | Secret key used to sign admin session tokens. |
| `WAITLIST_DATA_DIR` | Optional | Custom folder path for `waitlist.json` (e.g. a Render Persistent Disk mount path like `/var/data`). |
| `KV_REST_API_URL` & `KV_REST_API_TOKEN` | Optional (Vercel) | Connects to **Vercel KV / Upstash Redis** for permanent serverless storage. |
| `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY` | Optional (Vercel) | Connects to a **Supabase** `waitlist_signups` table (`id`, `email`, `source`, `created_at`). |

---

## Deploying

### Option 1: Render (Web Service — Recommended for zero-setup file storage)
1. Create a new **Web Service** on Render connected to this repository.
2. Set **Root Directory** to `landing-page`.
3. Set **Build Command** to ` ` *(leave blank)* and **Start Command** to `node server.mjs`.
4. Add environment variable `ADMIN_PASSWORD` (your secret password).
5. *(Optional)* Attach a Render Persistent Disk (e.g. `/var/data`) and set `WAITLIST_DATA_DIR=/var/data` so signups survive service redeploys.
6. Visit `https://your-site.onrender.com/admin` to view all saved emails!

### Option 2: Vercel (Static + Serverless Functions)
1. Import this repository in Vercel and set **Root Directory** to `landing-page`.
2. Add `ADMIN_PASSWORD` in Vercel Project Settings → Environment Variables.
3. For permanent storage across Vercel serverless cold starts, connect **Upstash Redis / Vercel KV** (`KV_REST_API_URL` + `KV_REST_API_TOKEN`) or **Supabase** (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).
4. Visit `https://your-site.vercel.app/admin` to view all saved emails!

---

## Local Testing

```bash
cd landing-page
ADMIN_PASSWORD="my-secret-password" node server.mjs
```

- Landing page: `http://localhost:3000/`
- Admin portal: `http://localhost:3000/admin`
