# Project Progress

**Current phase:** Phase 2 — Backend, Database, and Authentication (Completed & Verified)

---

## 1. Phase 2 Scope & Implementation Overview

Phase 2 establishes the server foundation for Cura, implementing the Express.js + TypeScript backend in `backend/`, the PostgreSQL database schema and migration system with Drizzle ORM, secure guest-first authentication, multi-batch idempotent client data migration, security middleware, and a comprehensive test suite.

### Key Deliverables Completed:

1. **Backend Directory Architecture (`backend/`):**
   - Initialized under `backend/` in accordance with Decision 0.1 and `docs/notes/architecture_plan.md`.
   - Node.js runtime target `>= 22.13.0` (tested with Node.js `v24.20.0`).
   - Pure TypeScript with strict mode, ES2022 target, and clean module resolution.
   - Distinct root directory separation between `mobile/` and `backend/`.

2. **PostgreSQL Database Schema & Migration System (Drizzle ORM):**
   - Configured via `drizzle.config.ts` and `src/db/schema/index.ts`.
   - 13 strongly-typed tables defined and generated into migration `0000_redundant_hannibal_king.sql`:
     1. **`users`:** id (UUID PK), email (unique), password_hash, display_name, timezone, sync columns (`server_revision`, `server_updated_at`, `is_deleted`, `deleted_at`), timestamps.
     2. **`user_preferences`:** user_id (FK PK), theme_mode, selected_chat_provider, selected_chat_model, selected_country, ai context toggles (`ai_include_tasks`, `ai_include_moods`), notification preferences, check-in times, quiet hours, sync columns.
     3. **`tasks`:** id (UUID PK), user_id (FK), title, description, due_date, due_time, is_timed, status, completed_at, postponed_at, sync columns.
     4. **`mood_entries`:** id (UUID PK), user_id (FK), mood_type (9 spectrum values), note, tags (`text[]`), logged_at, sync columns.
     5. **`conversations`:** id (UUID PK), user_id (FK), title, conversation_type, sync columns.
     6. **`messages`:** id (UUID PK), conversation_id (FK), sender ('user' | 'assistant' | 'system'), content, provider_used, model_used.
     7. **`daily_summaries`:** id (UUID PK), user_id (FK), date, summary_text, task completion counts, mood_distribution (`jsonb`), provider_used.
     8. **`ai_insights`:** id (UUID PK), user_id (FK), insight_type, content, is_dismissed, created_at.
     9. **`refresh_tokens`:** id (UUID PK), user_id (FK), token_hash, expires_at, revoked_at, created_at.
     10. **`migrationBatches`:** id (UUID PK), user_id (FK), batch_id (unique varchar), client_mutation_ids (`jsonb`), entity_counts (`jsonb`), status, processed_at.
     11. **`mutation_idempotency`:** id (UUID PK), user_id (FK), client_mutation_id (unique varchar), entity_type, entity_id, processed_at.
     12. **`quote_pool`:** id (UUID PK), quote_text, author, category, created_at.
     13. **`user_active_quote`:** id (UUID PK), user_id (FK), quote_id (FK), displayed_at.

3. **Authentication & Account Linking Foundation:**
   - **Guest-First Architecture:** Mobile client functions fully offline as a guest without requiring registration.
   - **Registration (`POST /api/auth/register`):** Creates account with email/password, bcrypt password hashing (work factor 12 per Decision 0.12), issues short-lived JWT access token (15m) and refresh token (7d), provisions default `user_preferences`.
   - **Login (`POST /api/auth/login`):** Validates credentials, issues JWT access token and refresh token, hashes and stores refresh token.
   - **Token Refresh (`POST /api/auth/refresh`):** Verifies refresh token signature, checks revocation status in DB, rotates refresh token, and issues new access token.
   - **Profile & Preferences (`GET /api/auth/me`):** Returns authenticated user profile and user preferences.
   - **Logout (`POST /api/auth/logout`):** Revokes refresh token in database.

4. **Multi-Batch Idempotent Guest Migration (`POST /api/auth/migrate-batch`):**
   - Receives batches of offline guest records (`tasks`, `moodEntries`, `userPreferences`, `clientMutationIds`, `batchId`).
   - Server processes the batch inside a database transaction (`BEGIN ... COMMIT`).
   - Entities inserted with `user_id = req.user.id` and `ON CONFLICT (id) DO NOTHING`.
   - Client mutation IDs recorded in `mutation_idempotency` with `ON CONFLICT DO NOTHING`.
   - Idempotency verified: re-sending the same `batchId` detects existing record and returns HTTP 200 with `status: 'already_processed'` without duplicate inserts.
   - **Never-Delete Safety Rule Adhered To:** Local guest records are never deleted; client updates local `user_id` to authenticated user only after server confirmation.

5. **Security, Middleware & Validation:**
   - **Helmet:** Secure HTTP headers enabled.
   - **CORS:** Configurable origin matching via `CORS_ORIGIN` env variable.
   - **Zod Validation Middleware:** All endpoints validated strictly against Zod schemas; malformed bodies rejected with 400 `VALIDATION_ERROR`.
   - **JWT Authentication Middleware:** Enforces Bearer token presence, verifies signature, verifies token type is `access`, rejects expired or tampered tokens with 401.
   - **Sanitized Request Logger:** Logs routing telemetry and status codes while masking credentials, tokens, and authorization headers.
   - **Centralized Error Handler:** Consistent JSON error structure `{ success: false, error: { code, message, details? } }`.
   - **Environment Configuration (`env.ts`):** Validated on startup with Zod. Template provided in `.env.example`.

6. **Backend Health Check:**
   - `GET /api/health`: Returns HTTP 200 with uptime, timestamp, server status, and database connectivity.

---

## 2. Test Verification & Diagnostics Record

### A. Backend Diagnostics (`backend/`)

| Diagnostic / Check | Command | Status | Result Summary |
| :--- | :--- | :---: | :--- |
| **TypeScript Strict Checking** | `npm run typecheck` (`tsc --noEmit`) | **PASSED** | Exit code 0: 0 errors across all routes, middleware, schemas, and config. |
| **ESLint Quality Analysis** | `npm run lint` (`eslint src/`) | **PASSED** | Exit code 0: Clean flat configuration, 0 warnings, 0 errors. |
| **Drizzle Migration Generation** | `npm run db:generate` (`drizzle-kit generate`) | **PASSED** | Exit code 0: Generated migrations 0000 and 0001 (13 tables, foreign keys, unique composite constraints). |
| **Automated Test Suite** | `npm test` (`vitest run`) | **PASSED** | **30/30 tests passed** across 6 test suites (100% pass rate). |

### B. Test Suite Breakdown (`backend/tests/`)

Tests are categorized into **HTTP & Middleware Unit/Mock Tests** and **Real In-Memory PostgreSQL Integration Tests**:

#### 1. Real In-Memory PostgreSQL Integration Tests (`tests/pglite.test.ts` — 7 tests):
*Runs against an isolated in-memory PostgreSQL instance powered by PGLite, executing actual generated SQL migration files without external network or local database daemon dependencies.*
- **Real Constraint Enforcement:** Unique constraint violation (`23505`) verified on `users.email`.
- **Real Foreign Key Cascades:** Deleting a `users` row cascades and automatically deletes related rows in `tasks` and `user_preferences`.
- **Single-Use Refresh Token Rotation:** Atomic conditional update (`WHERE id = :id AND revoked_at IS NULL RETURNING *`) verified in PostgreSQL; token can only be consumed once.
- **Concurrent Refresh Request Race Safety:** Two concurrent refresh requests executed simultaneously with `Promise.allSettled`; exactly one succeeds and the other fails with `TOKEN_REVOKED`.
- **Cross-User Overwrite Prevention:** User B cannot overwrite User A's task (`ON CONFLICT (id) DO NOTHING`). The task remains owned by User A.
- **Transaction Atomic Rollback:** When a migration batch transaction fails midway, all interim operations are rolled back completely leaving 0 partial records in PostgreSQL.
- **Composite Unique Batch Scoping:** `UNIQUE(user_id, batch_id)` verified in PostgreSQL; different users can use the same batch identifier, while duplicate batch submissions by the same user are rejected.

#### 2. HTTP Routing, Security & Validation Tests (Supertest with Mocked DB — 23 tests):
- **`health.test.ts` (2 tests):** Returns HTTP 200 with uptime, database status; returns structured 404 for unknown endpoints.
- **`validation.test.ts` (5 tests):** Zod middleware rejects invalid email, short password (<8 chars), missing password, missing refresh token, and malformed migration batch payloads.
- **`auth.test.ts` (9 tests):** Registration, duplicate email 409 rejection, credential verification, invalid password 401 rejection, token refresh, `/me` profile retrieval, unauthenticated 401 rejection, token invalidation, and logout revocation.
- **`migration.test.ts` (3 tests):** Rejects unauthenticated migration (401), processes valid batch returning confirmed IDs, and enforces batch idempotency (`already_processed`).
- **`authorization.test.ts` (4 tests):** Rejects refresh token submitted as Bearer access token, rejects expired tokens (`TOKEN_EXPIRED`), rejects invalid signature tokens, and rejects non-Bearer Authorization headers.

### C. Mobile Client Regression Verification (`mobile/`)

| Diagnostic / Check | Command | Status | Result Summary |
| :--- | :--- | :---: | :--- |
| **TypeScript Strict Checking** | `cd mobile; npm run typecheck` | **PASSED** | Exit code 0: Zero regressions in Expo app. |
| **ESLint Quality Analysis** | `cd mobile; npm run lint` | **PASSED** | Exit code 0: Mobile design system and screens fully intact. |

---

## 3. Scope Boundaries & Phase Plan

In strict accordance with Phase 2 scope:
- **No Task CRUD Endpoints:** Task creation, updating, and deletion REST endpoints are deferred to Phase 3. Only the database schema and migration batch UPSERT are implemented.
- **No Mood Logging Endpoints:** Mood CRUD and analytics endpoints are deferred to Phase 4. Only the schema and migration batch UPSERT are implemented.
- **No AI Provider Integration:** No AI keys or AI routing logic have been created. Multi-provider AI abstraction is deferred to Phase 5.
- **No Notifications or Widgets:** Push notification handlers and home-screen widgets remain deferred to Phases 7 and 8.
- **Client Uncoupled from Cloud:** The mobile app remains completely functional offline as guest; backend connectivity is purely optional.

---

## 4. Next Phase Roadmap

- **Phase 3 — Task Management:**
  - Local SQLite task repository in `mobile/src/db/`.
  - Task CRUD operations, state transitions (pending, completed, postponed, cancelled).
  - Task synchronization engine (`outbox_mutations` queue, push/pull).
  - Category filters and date/time picker UI integration.
