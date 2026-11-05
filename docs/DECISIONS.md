# Project Decisions

This document records the foundational architectural, technical, and product decisions made for Cura, following the format prescribed in the project specification.

---

## 1. Initial Product & Platform Decisions

- **Mobile Framework:** React Native + Expo (SDK 58 baseline: React Native 0.88.x, React 19.3.x, Node.js >= 22.13.x, verified with local Node.js v24.20.0).
  - *Why:* Rapid development, cross-platform stability, New Architecture (TurboModules & Fabric) mandatory baseline, Continuous Native Generation (CNG), and seamless OTA updates via EAS.
  - *Package Installation Rule:* All Expo native packages must be added via `npx expo install` and aligned with `npx expo install --fix` against the official Expo SDK 58 manifest.
  - *Alternatives considered:* Pure native Swift/Kotlin (slow development, duplicate codebases), Flutter (Dart ecosystem, lacks native SwiftUI widget bridge flexibility).
  - *Limitations:* Home-screen widgets and custom native permissions require custom config plugins and prebuild/EAS development builds instead of Expo Go.

- **Language:** TypeScript (Strict mode enabled across mobile and backend).
  - *Why:* End-to-end type safety, fewer runtime bugs, and shared types between client and backend.
  - *Alternatives considered:* Plain JavaScript (lacks type safety).

- **Theme Strategy:** Dark mode default, with intentionally designed Light and System modes.
  - *Why:* Matches modern personal companion aesthetics and user expectation. Centralized semantic design tokens prevent hardcoded color proliferation.
  - *Alternatives considered:* Inverted color schemes (violates SPEC 4.2; light mode must be designed intentionally).

- **Development Process:** Phase-based development (Phases 0 through 10).
  - *Why:* Ensures strict verification, modular milestones, and prevents scope creep.

---

## 2. Phase 0 Technical Architecture Decisions

### Decision 0.1: Repository and Project Structure (Isolated Subdirectories)
- **The Decision:** Organize the codebase into two top-level isolated directories: `mobile/` for the Expo application and `backend/` for the Node.js/PostgreSQL server, with root documentation (`docs/`, `SPEC.md`, `README.md`).
- **Why it was made:** Prevents dependency collisions between React Native / Metro bundler and Node.js backend tooling. Allows independent `package.json`, `tsconfig.json`, and deployment pipelines.
- **Alternatives considered:** Single flat root or complex monorepos.

### Decision 0.2: Backend Runtime and Framework (Express.js + TypeScript)
- **The Decision:** Use **Express.js with TypeScript** for the backend API and background worker scheduler. Do not use Fastify.
- **Why it was made:** Confirmed by user alignment. Express is battle-tested, straightforward, universally understood, has vast community middleware support, and provides zero friction for modular domain architectures and AI SDK integrations.
- **Limitations:** Server process requires a continuous Node.js runtime host (e.g. Railway, Render, Fly.io) to support cron-based background jobs.

### Decision 0.3: Database and ORM
- **The Decision:** PostgreSQL with Drizzle ORM on the backend.
- **Why it was made:** PostgreSQL provides relational integrity, native JSONB support for mood distributions/preferences, array types for tags, and strong date/time operations. Drizzle ORM provides a lightweight footprint, zero binary engine overhead, and explicit SQL schema migrations.
- **Alternatives considered:** Prisma (heavy binary engine), MongoDB (lacks relational integrity).

### Decision 0.4: AI Provider Architecture & Model Data Privacy
- **The Decision:** Universal `IAIProvider` interface on the backend.
  - **Interactive Chat:** Locked to a single user-selected provider per conversation session. In case of quota exhaustion, a polite quota notice is returned with estimated reset time; the user's draft is preserved client-side.
  - **Background AI Operations:** Handled by a multi-provider Failover Engine (Gemini $\rightarrow$ Groq $\rightarrow$ OpenRouter/Cloudflare).
  - **Data Privacy Realities:** Rejects blanket claims of "Zero PII" or universal "no training". User-generated text can contain personal details. Context sent to AI is strictly bounded (today's tasks, 3-day mood tags, active thread turns). Accounts must be aware of provider tiers: Google Gemini free tier may log data for model improvement, whereas Google paid tier and Groq developer APIs contractually exclude customer data from model training.
  - **User Configurable:** Users can toggle whether tasks or mood tags are included in AI context.

### Decision 0.5: Notification Strategy
- **The Decision:** Hybrid notification approach:
  - **Local Notifications (`expo-notifications: ~58.0.0`):** For Timed Task reminders, End-of-Day task summaries, and Daily Check-ins. Operates offline.
  - **Remote Push Notifications (Expo Push Service):** For asynchronous AI insights and server-generated milestones.
- **Limitations:** Android 13+ requires runtime notification permissions; Android 14+ requires checking `SCHEDULE_EXACT_ALARM` permissions. App boot initiates a rescheduling service for local alarms cleared after OS reboot.

### Decision 0.6: Home-Screen Widgets Technology
- **The Decision:**
  - **Android:** Use **`react-native-android-widget: ~0.14.0`** as the single primary technology.
    - *Why:* Keeps layout and interaction logic in TypeScript/JSX, uses maintained built-in Expo config plugin, and satisfies all requirements (today's tasks list, tap to complete, mood selector buttons, 5-hour quote display) without maintaining custom fragile Kotlin string-replacement scripts.
    - *Limitations:* Constrained to Android RemoteViews capabilities; runs in headless JS task runner without live React component state.
  - **iOS:** Use native **SwiftUI WidgetKit extension** managed via `@bacons/apple-targets: ~0.0.65` with an **App Group** (`group.com.cura.app`) sharing local storage.
  - **Quotes:** Pre-scheduled timeline entries rotate personalized quotes every ~5 hours with a local fallback pool to guarantee quotes are never blank.
- **Limitations:** Widgets require Expo Development Builds (`eas build` or local prebuild); cannot run in Expo Go.

### Decision 0.7: EAS Update and Compatibility Protection
- **The Decision:** Enable EAS Update with runtime version policy set to `"fingerprint"`.
- **Why it was made:** Prevents crashing production apps by automatically blocking JS updates if native dependencies or configurations differ from the binary build.

### Decision 0.8: Visualization & Charting Strategy
- **The Decision:** Custom responsive SVG components using `react-native-svg: ~15.11.0` for the 4 core charts (Mood Trend Line/Area, Mood Distribution Donut, Task Progress Ring, Task Activity Bar Chart).
- **Why it was made:** Guarantees 100% fidelity to the centralized semantic design tokens in both dark and light modes, zero unexpected native crashes, responsive sizing, and accessible descriptions.

### Decision 0.9: Authentication Strategy & Reliable Guest Migration
- **The Decision:** Implement a **guest-first model** where users can immediately use Cura without creating an account.
- **Why it was made:** Removes friction, maximizes user privacy, and allows instant offline task management and mood logging.
- **Multi-Batch Idempotent Migration:** Migration does NOT execute as a single fragile transaction. It processes in batches (e.g., 50 items) with per-batch server-side transactions (`BEGIN ... COMMIT`) and idempotent keys (`ON CONFLICT (id) DO NOTHING`).
- **Never-Delete Safety Rule:** Local guest records are **never deleted** prior to server confirmation. Local records are updated in-place from `user_id = 'guest'` to the authenticated `user_id` only *after* the client successfully verifies the server's confirmed migrated entities.

### Decision 0.10: Offline-First Local Database & Monotonic Synchronization Engine
- **The Decision:**
  - **Local Database:** Use **`expo-sqlite: ~58.0.0` with Drizzle ORM (`^0.38.0`)** as the primary local database.
  - **Conflict Strategy:** Rejects fragile client-timestamp Last-Write-Wins. Adopts **Monotonically Increasing Server Revisions (`server_revision`)** paired with **Client Outbox Sequencing (`client_sequence`)**, field-aware merging, tombstones for soft deletion, and idempotent mutation tracking.
  - **Database-Enforced AI Permission Boundary:** Architectural code promises are insufficient. The backend enforces physical engine-level security using separate PostgreSQL roles: the AI subsystem connects via **`ai_service_role`**, which is strictly granted `SELECT` on `tasks` and `mood_entries` and explicitly revoked from `INSERT`, `UPDATE`, or `DELETE`. Any attempt by an AI worker to mutate user-authored tasks is rejected with SQL error `42501: insufficient_privilege`.

### Decision 0.11: Country Selection & Emergency Resources
- **The Decision:** Avoid hardcoding US-specific helplines (such as 988) universally.
- **Manual Preference over Locale:** Device locale is NOT proof of geographical residency. Cura relies strictly on a **manually selected country preference** in `user_preferences.selected_country` (with device locale providing only an initial suggestion).
- **Dynamic Helplines:** Resolves verified local helplines (US 988, UK 999/111, CA 988, AU 000/13 11 14, EU 112). If country is unset or unknown, presents verified international directory links (findahelpline.com, Befrienders Worldwide, IASP) and universal advice to dial local emergency services.
- **Honest Disclaimers:** Explicitly disclaim that heuristic keyword filters cannot guarantee emergency detection.

### Decision 0.12: Infrastructure Security Responsibilities
- **The Decision:** Clearly delineate security layers:
  - **Application Code:** Input validation (Zod), parameterized SQL queries (Drizzle), password hashing (bcrypt work factor 12), JWT scoping (`WHERE user_id = req.user.id`), database-level role separation (`ai_service_role`), log sanitization.
  - **Operating System:** Hardware-backed key protection via `expo-secure-store` (iOS Keychain / Android KeyStore) and app sandboxing.
  - **Hosting Infrastructure (Deployment Verification):** TLS 1.3 termination, database disk encryption at rest (AWS KMS / Cloud Disks), VPC isolation, and automated database backup snapshots.

### Decision 0.13: Target Dependency Matrix (Expo SDK 58 Baseline)
- **`expo`**: `~58.0.0`
- **`react-native`**: `0.88.x`
- **`react`**: `19.2.x`
- **`expo-router`**: `~58.0.0`
- **`expo-sqlite`**: `~58.0.0`
- **`expo-secure-store`**: `~58.0.0`
- **`expo-notifications`**: `~58.0.0`
- **`expo-updates`**: `~58.0.0`
- **`expo-haptics`**: `~58.0.0`
- **`@expo/vector-icons`**: `~14.1.0`
- **`drizzle-orm`**: `^0.38.0`
- **`@react-native-async-storage/async-storage`**: `~2.1.0`
- **`react-native-svg`**: `~15.11.0`
- **`react-native-android-widget`**: `~0.14.0`
- **`@bacons/apple-targets`**: `~0.0.65`

---

## 3. Phase 2 Backend, Database, and Authentication Decisions

### Decision 2.1: Refresh Token Strategy & Cryptographic Hashing
- **The Decision:** Store refresh tokens in PostgreSQL hashed via SHA-256 (`refresh_tokens.token_hash`), never in plaintext. Rotate refresh tokens upon each use (`POST /api/auth/refresh`), revoking the old token in a single database transaction while issuing a new pair.
- **Why it was made:** Protects against token compromise in the event of database leaks. SHA-256 is deterministic and fast for database index lookup while ensuring raw refresh tokens are never persisted at rest.
- **Alternatives considered:** Storing plaintext JWTs in DB (insecure), stateless refresh tokens (prevents server-side session revocation).

### Decision 2.2: Multi-Batch Idempotent Guest Migration Architecture
- **The Decision:** Implement `POST /api/auth/migrate-batch` to accept batches of guest entities (up to 50 per batch) alongside a unique `batch_id` and list of `client_mutation_ids`. Wrap each batch in a dedicated database transaction (`BEGIN ... COMMIT`) utilizing `ON CONFLICT (id) DO NOTHING`. Store processed batch IDs in `migration_batches` and mutation IDs in `mutation_idempotency`.
- **Why it was made:** Adheres strictly to Decision 0.9. Network timeouts on mobile connections can occur at any moment. By ensuring idempotent batch processing, client retries are completely safe and will never duplicate tasks, mood entries, or preferences.
- **Never-Delete Safety Rule:** The backend endpoint only confirms received and verified entity IDs; it never directs the client to delete records. The client safely updates local records in-place.

### Decision 2.3: Express 5 and ESNext Module Resolution
- **The Decision:** Use Express 5 (`^5.1.0`) with TypeScript 5.8 using `"module": "ESNext"` and `"moduleResolution": "bundler"`.
- **Why it was made:** Express 5 provides native Promise rejection handling in middleware without unhandled promise crashes. The ESNext bundler configuration seamlessly integrates with Drizzle Kit, Vitest, and TSX without requiring `.js` import extension ceremony or breaking CommonJS tool interoperability.

### Decision 2.4: Database Schema Revision & Offline Synchronization Readiness
- **The Decision:** Incorporate `server_revision` (integer), `server_updated_at` (timestamptz), `is_deleted` (boolean), and `deleted_at` (timestamptz) across all synchronizable tables (`users`, `user_preferences`, `tasks`, `mood_entries`, `conversations`).
- **Why it was made:** Guarantees that the database schema is completely prepared for Phase 3 and Phase 4 delta-based offline synchronization (`GET /api/sync/pull?since_revision=X` and `POST /api/sync/push`) without requiring disruptive schema alterations in later phases.



---

## 4. Phase 4 Mood Tracking & Analytics Decisions

### Decision 4.1: Non-Judgmental Categorical Mood Visualizations
- **The Decision:** Reject 1-dimensional numerical mood scores and emotional tier-grouping. Implement purely categorical representations:
  - **Day:** Chronological 24-hour emotional timeline (`DayMoodTimeline`) showing authentic mood labels, icons, 12h AM/PM timestamps, reflection notes, and context tags.
  - **Week:** 7-day Monday–Sunday calendar rhythm strip (`WeekMoodStrip`) showing actual recorded mood badges per weekday, with clean dashes (`—`) for unrecorded days.
  - **Month:** Calendar-style monthly mood matrix (`MonthMoodMatrix`) displaying colored mood dots per day with tap-to-inspect reflections.
  - **Distribution:** Responsive SVG donut chart (`MoodDistributionDonut`) counting recorded entries per mood category with percentages.
- **Why it was made:** Confirmed by user alignment and SPEC 2.1 (Non-judgmental experience) and SPEC 13.2. Collapsing distinct emotional states (e.g. *Tired* vs *Calm* vs *Anxious*) into a single score conflates energy with pleasantness and creates misleading numerical precision.
- **Alternatives considered:** 1–5 valence scale or 3-tier grouping (rejected as reductionist and judgmental).

### Decision 4.2: Historical Task Activity via Day-Level Last Transition Rule
- **The Decision:** Calculate daily task activity throughput using `task_history` transitions (`action IN ('completed', 'uncompleted')`), grouping by the user's local calendar day.
- **Insertion-Order Tie-Breaking:** Order transitions deterministically by `timestamp DESC, rowid DESC` using SQLite's built-in monotonic integer `rowid` (avoiding unordered UUID tie-breaking).
- **Counting Rule:** A task contributes $+1$ to a local day's activity if and only if its latest completion-state transition on that day was `action = 'completed'`. Other actions (`edited`, `postponed`, `cancelled`, `deleted`) do not override the completion state.
- **Why it was made:** Preserves historical accomplishments across subsequent uncompletions or soft-deletions on later days, prevents double-counting from rapid toggles, and neutralizes same-day accidental check/uncheck taps.
- **Alternatives considered:** Counting snapshot `completed_at` (erases past completions retroactively upon uncompletion).

### Decision 4.3: Calendar Period Boundaries (Monday–Sunday Week & Monthly Matrix)
- **The Decision:** Adopt standard local calendar boundaries:
  - **Day:** Local calendar day (`00:00:00.000` to `23:59:59.999`).
  - **Week:** Monday through Sunday (ISO 8601 standard).
  - **Month:** 1st of month through last day of month.
- **Timezone Handling:** Convert all ISO timestamps to local calendar strings using `toLocalDateString` based on the device's local timezone, never using raw UTC substring slicing.
- **Why it was made:** Aligns with human mental models, calendar planning, and SPEC 7.4 ("You logged more tired moods this week than last week").

### Decision 4.4: Local SQLite Sync Contract for Mood Entries
- **The Decision:** In migration `0003_mood_entries`:
  - `server_revision INTEGER NOT NULL DEFAULT 0` (0 for unsynced local drafts).
  - `server_updated_at TEXT` (strictly nullable, NULL until first verified server sync).
  - Outbound mutation payloads omit `serverUpdatedAt` so PostgreSQL generates the authoritative timestamp.
  - Unsynced deletions (`server_revision === 0`) remove the pending `INSERT` from `sync_outbox` while soft-deleting locally, avoiding unnecessary server `DELETE` mutations.
  - Unsynced edits coalesce into the pending `INSERT` payload.
- **Why it was made:** Strictly preserves the approved Phase 3 offline-first sync contract and eliminates timestamp spoofing.

### Decision 4.5: Single Source of Truth for Mood History
- **The Decision:** Use `mood_entries` as the single source of truth for both current entries and chronological history. Updates modify records in-place (`updated_at = now`) and queue outbox mutations. Do not create a separate `mood_history` audit table.
- **Why it was made:** Mood entries are point-in-time reflections, not multi-stage state machines like tasks. An audit ledger of text edits adds useless database overhead without user-facing benefit.
