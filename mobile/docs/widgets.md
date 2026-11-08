# Cura Native Home-Screen Widgets Architecture & Guide

## 1. Architecture Overview

```text
SQLite Mutation (Tasks / Moods)
   │
   ▼
SQLite Triggers (UPDATE widget_snapshot_metadata.source_revision)
   │
   ▼
publishOrchestrator (source_revision > published_revision check)
   │
   ▼
snapshotBuilder (Constructs deterministic WidgetSnapshot JSON)
   │
   ▼
Native Bridge: ExpoWidgetBridge Module (Android / iOS)
   │
   ▼
Storage: <filesDir|AppGroup>/snapshots/
   ├── current.json (Atomic pointer manifest)
   ├── snapshot_<userId>_<epoch>_<revision>_<uuid>.json (Versioned snapshot)
   └── .manifest.lock (Advisory lock / NSFileCoordinator)
   │
   ▼
Widget Engine: AppWidgetManager / WidgetCenter notification
   │
   ▼
Home-Screen Widgets (Android RemoteViews / iOS WidgetKit SwiftUI)
```

---

## 2. Manifest & Snapshot Schema

### 2.1 Manifest Pointer (`current.json`)
```json
{
  "activeFile": "snapshot_usr_test_1_2_a1b2c3d4.json",
  "accountEpoch": 1,
  "revision": 2,
  "userId": "usr_test",
  "updatedAt": "2026-11-08T15:24:43Z"
}
```

### 2.2 Snapshot JSON (`snapshot_*.json`)
```json
{
  "schemaVersion": 1,
  "revision": 2,
  "sourceRevision": 2,
  "userId": "usr_test",
  "accountEpoch": 1,
  "generatedAt": "2026-11-08T15:24:43.000Z",
  "tasks": {
    "todayTotal": 3,
    "todayCompleted": 1,
    "todayRemaining": 2,
    "overdueCount": 0,
    "items": [
      {
        "id": "task_uuid_1",
        "title": "Complete morning check-in",
        "status": "completed",
        "dueDate": "2026-11-08",
        "dueTime": "09:00",
        "isTimed": true,
        "completedAt": "2026-11-08T09:15:00.000Z"
      }
    ]
  },
  "mood": {
    "latestMoodType": "calm",
    "latestLoggedAt": "2026-11-08T09:16:00.000Z"
  },
  "quote": {
    "id": "quote-01",
    "text": "Breathe in peace, breathe out tension.",
    "author": "Cura"
  }
}
```

---

## 3. Deep-Link URI Specification

Widgets communicate interactive taps back to the main app using deep links:

```text
cura://widget-action?action_id=<UUID>&action_type=<task_toggle|mood_log>&target_id=<id>&requested_state=<string|JSON>&user_id=<userId>&client_action_time=<ISO8601>
```

- **Query Parameters:**
  - `action_id`: Fresh UUID generated per tap.
  - `action_type`: `'task_toggle'` or `'mood_log'`.
  - `target_id`: Target task UUID or `'widget_mood'`.
  - `requested_state`: `'completed'` / `'pending'` for tasks; `'{"moodType":"happy"}'` (JSON string) for moods.
  - `user_id`: Active user ID.
  - `client_action_time`: ISO8601 timestamp.
- **Header Navigation:**
  - `cura://tasks` $\rightarrow$ routes to `/(tabs)/tasks`.
  - `cura://mood` $\rightarrow$ routes to `/(tabs)/mood`.

---

## 4. Account Epoch Transitions

- **Session Invalidation:** On user switch, login, or logout, `account_epoch` increments by 1 (`account_epoch = account_epoch + 1`).
- **Revision Invariant:** Inside the same transaction, `newRev = oldSource + 1`, and `source_revision = :newRev, published_revision = :newRev`.
- **Cache Purge:** After the transaction commits, `clearSnapshots()` deletes all old snapshot files from storage so widgets immediately display placeholders or clean datasets for the new user, strictly preventing cross-account data leaks.

---

## 5. Storage Constraints & Guardrails

- **$N-1$ Pruning:** Native publishers retain only the active snapshot ($N$) and the immediately preceding snapshot ($N-1$). Older snapshots and orphan `.tmp` files older than 60 seconds are automatically deleted.
- **1MB Ceiling:** Both Android and iOS widgets enforce a strict 1,048,576-byte ceiling on snapshot files (Binder transaction / WidgetKit memory safety). Payloads exceeding 1MB fall back to placeholder views without crashing.
- **Item Caps:**
  - `snapshotBuilder.ts` caps snapshot items to **10 tasks**.
  - Android RemoteViews and iOS WidgetKit views cap display to the first **5 tasks**.

---

## 6. Testing & Manual Verification Guide

### 6.1 Real Device Testing on Android (SM-A528B)
1. Build and install to hardware:
   ```bash
   cd mobile
   npx expo run:android --device
   ```
2. Add widgets to home screen: Long press $\rightarrow$ Widgets $\rightarrow$ Cura Tasks & Cura Mood.
3. Test synchronization: In Cura, create 2 tasks and complete 1. Verify widget displays `"1 / 2 done"`.
4. Test interactivity: Tap a task checkbox on the home screen. Verify app opens, task toggles, and widget updates to `"2 / 2 done"`. Tap again to verify idempotency (no double-toggle).
5. Test mood logging: Tap a mood button (e.g., "Calm"). Verify app opens, mood logs, and widget updates.
6. Test session boundaries: Log in or switch user. Verify widget immediately clears prior user's data and displays new user's snapshot or placeholder.

### 6.2 Testing on iOS (macOS / Xcode)
1. Run prebuild:
   ```bash
   cd mobile
   npx expo prebuild --platform ios
   ```
2. In Apple Developer Portal, enable App Group `group.com.cura.app` for the main bundle ID (`com.cura.app`) and the widget extension.
3. In Xcode, add a Widget Extension target named `CuraWidgets` referencing source files in `modules/widget-bridge/ios/Widgets/`.
4. Run development build:
   ```bash
   eas build --profile development --platform ios
   ```
5. Add widgets from the iOS Widget Gallery and verify rendering and AppIntent / deep-link interaction.

---

## 7. Known Limitations

1. **Android Tap Path:** Interactive taps on Android widgets foreground the app via `cura://widget-action` rather than executing silently in a headless background service.
2. **iOS Target Integration:** The iOS Widget Extension target must be created and signed in Xcode on macOS (Windows workstations cannot generate compiled iOS extension binaries).
3. **Phase 1 Auth Scope:** Cura is currently in guest mode; `transitionAccountEpoch` and `migrateGuestDataToUser` are fully implemented and covered by unit tests, but UI wiring to real cloud login/logout flows will occur in Phase 9.
