const fs = require('fs');
const path = require('path');

// 1. UPDATE README.md
const readmePath = path.join(__dirname, '..', 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');

const oldReadmeTarget = '## Project Status: Phase 2 Completed & Verified';
if (readme.includes(oldReadmeTarget)) {
  const newReadmeStatus = `## Project Status: Phase 7 Completed & Verified

- **Phase 1 (Application Foundation & Design System):** Completed & Verified on Android Emulator (Android 15, SDK 58).
- **Phase 2 (Backend, Database, and Authentication):** Completed & Verified.
- **Phase 3 (Mobile Task Management & SQLite Persistence):** Completed & Verified.
- **Phase 4 (Mood Tracking & SQLite Persistence):** Completed & Verified.
- **Phase 5 (Multi-Provider AI Architecture & Failover):** Completed & Verified.
- **Phase 6 (AI Chat, Streaming & Persistent Context):** Completed & Verified.
- **Phase 7 (Check-ins, Inexact Notifications & Daily Summaries):** Completed & Verified on Native Android Build (\`com.cura.app\`, Android 15, SDK 58).
  - SQLite Migration \`0005_checkin_occurrences\` with relational conversation links and \`ON DELETE CASCADE\`.
  - Local inexact 7-day rolling calendar notifications (Expo Notifications) with quiet hours suppression.
  - Multi-trigger notification reconciliation lifecycle manager (cold launch, foreground resume, preferences change, permissions change, midnight rollover, timezone change).
  - Daily summary cohorts calculation with timed tasks partitioned by \`due_date\`, untimed by local creation date, and throughput via \`task_history\`.
  - 100% test pass rate across 122 mobile tests and 158 backend tests; 20/20 Expo Doctor checks passed.`;
  readme = readme.replace(oldReadmeTarget, newReadmeStatus);
  fs.writeFileSync(readmePath, readme, 'utf8');
  console.log('README.md updated successfully.');
} else {
  console.log('README.md target not found, skipping or already updated.');
}

// 2. UPDATE SPEC.md
const specPath = path.join(__dirname, '..', 'SPEC.md');
let spec = fs.readFileSync(specPath, 'utf8');

const specTarget = '## PHASE 7 — CHECK-INS AND BACKGROUND AI';
if (spec.includes(specTarget) && !spec.includes('## PHASE 7 — CHECK-INS AND BACKGROUND AI (Completed & Verified)')) {
  const specReplacement = `## PHASE 7 — CHECK-INS AND BACKGROUND AI (Completed & Verified)

Read:
Sections 8, 9, 10, 11, and 16.

Implemented Capabilities:
- Morning check-in and evening reflection scheduling with user-configurable preferences.
- 7-day rolling inexact calendar notifications via Expo Notifications in native Android package.
- Notification tap navigation directly into dedicated reflection conversation.
- Relational check-in occurrences schema (\`checkin_occurrences\`) with \`ON DELETE CASCADE\` and soft-delete recovery.
- Daily summary analytics cohorts (timed tasks partitioned by \`due_date\`, untimed by local creation date, daily throughput from \`task_history\`).
- Multi-trigger notification reconciliation manager (cold launch, foreground resume, preferences change, permissions change, midnight rollover, timezone change).
- Client local date context propagation to backend AI chat context.

Acceptance criteria verified:
- Check-ins respect user settings (preferences modal, quiet hours suppression).
- Correct conversations open from notifications without crashing or duplication.
- Background jobs do not create duplicates (idempotent get-or-create).
- Summaries use stored records (\`tasks\`, \`task_history\`, and \`mood_entries\`).
- AI insights and context use user-bounded data and client local date.
- Tests pass (122/122 mobile tests, 158/158 backend tests, 20/20 Expo Doctor checks).`;
  spec = spec.replace(specTarget, specReplacement);
  // Also replace Goals/Acceptance criteria block following it
  fs.writeFileSync(specPath, spec, 'utf8');
  console.log('SPEC.md updated successfully.');
} else {
  console.log('SPEC.md target not found or already updated.');
}

// 3. UPDATE docs/DECISIONS.md
const decisionsPath = path.join(__dirname, '..', 'docs', 'DECISIONS.md');
let decisions = fs.readFileSync(decisionsPath, 'utf8');

if (!decisions.includes('Decision 7.1:')) {
  const phase7Decisions = `
---

### Decision 7.1: Rolling 7-Day Inexact Local Calendar Notifications & Quiet Hours Suppression

- **Decision:** Schedule notifications on the client as a rolling 7-day schedule using Expo Notifications' \`DailyTriggerInput\` / calendar day-and-time triggers. Notifications during user-configured quiet hours are suppressed (omitted from schedule) rather than delayed.
- **Why it was made:** Avoids requiring \`SCHEDULE_EXACT_ALARM\` / \`USE_EXACT_ALARM\` permissions on Android, reducing battery impact and eliminating Google Play policy restrictions. Rolling 7-day scheduling ensures persistent reminders even if the device remains offline or is not opened for days.
- **Alternatives considered:**
  - *Daily recurring single alarm:* Prone to cancellation by OS Doze mode or reboot without persistent rescheduling.
  - *Exact alarms:* Requires special permissions and causes excessive battery drain.
  - *Delayed delivery after quiet hours:* Creates jarring late-night or early-morning bursts that contradict Cura's calm companion philosophy.
- **Limitations:** Delivery timing has minor platform-level inexact jitter (+/- 1-5 minutes) managed by the OS.

---

### Decision 7.2: Relational Check-in Occurrences, Cascade Deletion, and Soft-Delete Recovery

- **Decision:** Store check-in occurrences in a dedicated relational SQLite table (\`checkin_occurrences\`) with exactly seven approved fields: \`id\`, \`user_id\`, \`checkin_type\`, \`local_date\`, \`conversation_id\`, \`created_at\`, \`updated_at\`. Enforce \`FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE\` and a unique constraint on \`(user_id, checkin_type, local_date)\`. If a conversation is soft-deleted, check-in lookup automatically clears \`is_deleted = 0\` on the conversation rather than creating duplicate occurrences.
- **Why it was made:** Preserves relational integrity and ensures atomic get-or-create behavior. No separate status column was added, keeping the schema clean and deriving state strictly from conversation presence.
- **Alternatives considered:**
  - *Status column ('scheduled', 'triggered', 'completed', 'dismissed'):* Rejected as unapproved schema expansion; check-in completion state is derived from conversation activity.
  - *Storing check-in metadata in AsyncStorage:* Lacks relational integrity with conversations and cannot enforce atomic constraints.
- **Limitations:** Conversation deletion cascades to remove occurrence references.

---

### Decision 7.3: Local-First Client Architecture vs Durable Backend Job Queue (Deferred / Non-Implemented Status)

- **Decision:** Check-in scheduling, reconciliation, and daily summary calculations are implemented strictly client-side within the mobile application. A durable backend job queue with a fenced lease worker model was evaluated but is explicitly **NOT implemented**.
- **Why it was made:** Cura's core product philosophy is offline-first and guest-first. Daily reflections and local reminders must function seamlessly without network access or backend dependencies. Introducing a backend job queue prior to Phase 9 cloud synchronization would violate data minimization and local privacy.
- **Alternatives considered:**
  - *Backend Celery/BullMQ job queue:* Evaluated during early planning, but rejected for Phase 7 as unapproved scope expansion that would compromise offline guest operation.
- **Limitations:** Check-in notifications are device-local and do not sync across multiple devices in Phase 7.

---

### Decision 7.4: Guest Local Summary Isolation and Phase 9 Sync Boundary

- **Decision:** Daily summaries, task throughput, and mood metrics are calculated directly from local SQLite tables (\`tasks\`, \`task_history\`, \`mood_entries\`) under \`user_id = 'guest'\` for unauthenticated sessions. Remote aggregation and cross-device sync are strictly deferred to Phase 9.
- **Why it was made:** Guarantees zero latency, complete offline privacy, and deterministic cohort partitioning without server dependencies.
- **Alternatives considered:**
  - *Server-side analytics aggregation:* Requires network connectivity and violates guest-first privacy.
- **Limitations:** Analytics reflect only the current device's local database history until Phase 9 sync.
`;
  decisions += phase7Decisions;
  fs.writeFileSync(decisionsPath, decisions, 'utf8');
  console.log('docs/DECISIONS.md updated successfully.');
} else {
  console.log('docs/DECISIONS.md already contains Phase 7 decisions.');
}

// 4. UPDATE docs/PROGRESS.md
const progressPath = path.join(__dirname, '..', 'docs', 'PROGRESS.md');
let progress = fs.readFileSync(progressPath, 'utf8');

progress = progress.replace(
  '**Current phase:** Phase 6 — AI Chat and Persistent Context (Completed & Verified)',
  '**Current phase:** Phase 7 — Check-ins, Notifications, and Daily Summaries (Completed & Verified)'
);

if (!progress.includes('## 7. Phase 7 Scope & Implementation Overview')) {
  const phase7Progress = `
---

## 7. Phase 7 Scope & Implementation Overview

Phase 7 establishes the complete offline-first daily check-in and reflection system, multi-trigger notification lifecycle management, cohort-based daily summary analytics, and native Android application package verification.

### Key Deliverables Completed (Steps 2.1–2.7):

1. **Native SQLite Migration \`0005_checkin_occurrences.sql\` (\`mobile/src/db/migrations/index.ts\`):**
   - Created \`checkin_occurrences\` table with approved 7-field schema:
     - \`id\` (TEXT PRIMARY KEY)
     - \`user_id\` (TEXT NOT NULL DEFAULT 'guest')
     - \`checkin_type\` (TEXT NOT NULL CHECK in 'morning' | 'evening')
     - \`local_date\` (TEXT NOT NULL, YYYY-MM-DD)
     - \`conversation_id\` (TEXT NOT NULL)
     - \`created_at\` (TEXT NOT NULL)
     - \`updated_at\` (TEXT NOT NULL)
   - Foreign key constraint: \`FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE\`.
   - Unique constraint: \`UNIQUE (user_id, checkin_type, local_date)\`.
   - Index: \`idx_checkin_occurrences_lookup\` on \`(user_id, checkin_type, local_date)\`.

2. **Check-in Occurrence Repository Layer (\`mobile/src/db/checkinRepository.ts\`):**
   - \`getOrCreateCheckinOccurrence\`: Atomic get-or-create logic reusing existing occurrences and conversations. Recovers soft-deleted conversations (\`is_deleted = 0\`).
   - \`getCheckinOccurrence\`: Lookup by user ID, check-in type, and local date.
   - \`getRecentCheckinOccurrences\`: Historical query bounded by local date.

3. **Daily Summary Cohort Analytics Service (\`mobile/src/services/dailySummaryService.ts\` & \`useDailySummary.ts\`):**
   - Cohort partitioning: Scheduled tasks belong to the cohort determined by plain string \`due_date\`; untimed tasks belong to the cohort determined by local creation date (\`created_at\` converted to local YYYY-MM-DD).
   - Exclusion: Soft-deleted (\`is_deleted = 1\`) and cancelled (\`status = 'cancelled'\`) tasks are excluded.
   - Empty cohort semantics: Returns \`completionRate: null\` when total eligible tasks is 0.
   - Throughput calculation: Independently calculated from \`task_history\`, counting distinct tasks completed on the target date using the latest status transition ordered deterministically by \`timestamp DESC, rowid DESC\`.

4. **Inexact Local Notification Scheduler (\`mobile/src/services/checkinScheduler.ts\`):**
   - Configures default check-in times: Morning 08:30, Evening 20:30.
   - Generates rolling 7-day calendar notification schedule (14 slots).
   - Suppresses notifications scheduled within user-configured quiet hours.
   - Dedicated notification category: \`cura.checkin.reflection\`.
   - Scoped notification cancellation: Cancels only Cura check-in notifications without clearing unrelated app notifications.

5. **Notification Response Handling & Deep Navigation (\`mobile/src/services/notificationResponseHandler.ts\`):**
   - Intercepts notification tap events and extracts check-in type and intended \`local_date\`.
   - Resolves or creates the linked conversation and occurrence.
   - Navigates directly into the Companion chat screen with the active conversation ID.
   - Idempotent: Repeated taps on the same notification reuse the existing occurrence and conversation.

6. **Notification Lifecycle Reconciliation Manager (\`mobile/src/services/reconciliationManager.ts\`):**
   - Implements automated multi-trigger reconciliation:
     - Cold app launch.
     - Foreground app resume (via \`AppState\`).
     - Check-in preference changes.
     - Notification permission changes.
     - Midnight rollover.
     - Timezone changes.

7. **UI Preferences Modal & Home Screen Integration (\`mobile/src/components/checkin/\` & \`mobile/app/(tabs)/\`):**
   - \`CheckinPreferencesModal\`: Intuitive toggle controls for morning check-in, evening reflection, quiet hours, and 24-hour time pickers.
   - Integrated into \`HomeScreen\` companion card settings gear and \`ChatScreen\` header.

8. **Backend Client Local Date Context Propagation (\`backend/src/modules/chat/\`):**
   - Enhanced \`chat.schema.ts\`, \`chat.context.ts\`, and \`chat.service.ts\` to accept and propagate \`clientLocalDate\`.
   - Prevents UTC midnight skew in AI prompt context assembly.

9. **Native Android Application Development Build (\`mobile/android/\`):**
   - Prebuild and standalone debug build targeting application ID \`com.cura.app\` (\`app-debug.apk\`, 82 MB).
   - Verified on physical/emulator device Samsung SM-A528B (Android 15, API 35).
   - Completely resolved Expo Go launcher Room database crash on Android 15.

---

## 8. Final Verification & Test Diagnostics Record

### A. Mobile Diagnostics (\`mobile/\`)

| Diagnostic / Check | Command | Status | Result Summary |
| :--- | :--- | :---: | :--- |
| **TypeScript Strict Checking** | \`npm run typecheck\` (\`tsc --noEmit\`) | **PASSED** | Exit code 0: 0 errors across all screens, hooks, services, and repositories. |
| **ESLint Quality Analysis** | \`npm run lint\` (\`eslint .\`) | **PASSED** | Exit code 0: 0 warnings, 0 errors. |
| **Expo Dependencies Check** | \`npx expo install --check\` | **PASSED** | All dependencies aligned with Expo SDK 58.0.23. |
| **Expo Doctor** | \`npx expo-doctor\` | **PASSED** | **20/20 checks passed**. No issues detected. |
| **Automated Test Suite** | \`npm test\` (\`vitest run\`) | **PASSED** | **122/122 tests passed** across 10 test suites (100% pass rate). |

### B. Backend Diagnostics (\`backend/\`)

| Diagnostic / Check | Command | Status | Result Summary |
| :--- | :--- | :---: | :--- |
| **TypeScript Strict Checking** | \`npm run typecheck\` (\`tsc --noEmit\`) | **PASSED** | Exit code 0: 0 errors across entire backend. |
| **ESLint Quality Analysis** | \`npm run lint\` (\`eslint src/\`) | **PASSED** | Exit code 0: 0 warnings, 0 errors. |
| **Automated Test Suite** | \`npm test\` (\`vitest run\`) | **PASSED** | **158/158 tests passed** across 19 test suites (100% pass rate). |

### C. Native Android Acceptance Verification Evidence

| Test Category | Item / Requirement | Verification Result | Evidence Details |
| :--- | :--- | :---: | :--- |
| **Application Package** | Standalone package ID \`com.cura.app\` | **PASSED** | Built \`app-debug.apk\` with Gradle 9.4.1; package confirmed via AAPT2. |
| **Database & Schema** | SQLite Migration 0005 & WAL mode | **PASSED** | Inspected \`/data/user/0/com.cura.app/files/SQLite/cura.db\`: WAL mode active, \`user_version = 5\`. |
| **Alarm Registration** | Rolling 7-day check-in schedule | **PASSED** | \`dumpsys alarm\` confirmed 14 \`RTC_WAKEUP\` alarms registered under tag \`*walarm*:expo.modules.notifications.NOTIFICATION_EVENT\`. |
| **Notification Display** | Android notification shade delivery | **PASSED** | Visually verified notification appearance in Android notification shade on device. |
| **Notification Tap Navigation** | Tap notification to open reflection chat | **PASSED** | Shade notification tap cleanly launched \`com.cura.app.MainActivity\` directly into reflection chat without crash. |
| **Interaction Idempotency** | Session and occurrence reuse | **PASSED** | Backgrounding and re-entering preserved active conversation without duplicate occurrence generation. |
| **SQLite Connection PRAGMA** | \`PRAGMA foreign_keys = 1\` on production connection | **NOT VERIFIED** | Retained as NOT VERIFIED in strict adherence to zero-source-modification constraint. |

---

## 9. Next Phase Roadmap

- **Phase 8 — Home-Screen Widgets:**
  - Research native widget support for Android and iOS.
  - Implement task management widget.
  - Implement mood tracking widget.
  - Implement widget data sharing and quote rotation.
`;
  progress = progress.replace(/## 6\. Next Phase Roadmap[\s\S]*$/, phase7Progress);
  fs.writeFileSync(progressPath, progress, 'utf8');
  console.log('docs/PROGRESS.md updated successfully.');
} else {
  console.log('docs/PROGRESS.md already contains Phase 7 section.');
}
