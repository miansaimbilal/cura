# Cura — Personal Companion

An AI-powered personal companion application for daily task management, mood tracking, personal reflection, and analytics.

---

## Project Status: Phase 7 — Completed with Documented Limitations

- **Phase 1 (Application Foundation & Design System):** Completed & Verified on Android Emulator (Android 15, SDK 58).
- **Phase 2 (Backend, Database, and Authentication):** Completed & Verified.
- **Phase 3 (Mobile Task Management & SQLite Persistence):** Completed & Verified.
- **Phase 4 (Mood Tracking & SQLite Persistence):** Completed & Verified.
- **Phase 5 (Multi-Provider AI Architecture & Failover):** Completed & Verified.
- **Phase 6 (AI Chat, Streaming & Persistent Context):** Completed & Verified.
- **Phase 7 (Check-ins, Inexact Notifications & Daily Summaries):** Phase 7 — Completed with Documented Limitations on Native Android Build (`com.cura.app`, Android 15, SDK 58).
  - SQLite Migration `0005_checkin_occurrences` with relational conversation links and `ON DELETE CASCADE`.
  - Local inexact 7-day rolling calendar notifications (Expo Notifications) with quiet hours suppression.
  - Multi-trigger notification reconciliation lifecycle manager (cold launch, foreground resume, preferences change, permissions change, midnight rollover, timezone change).
  - Daily summary cohorts calculation with timed tasks partitioned by `due_date`, untimed by local creation date, and throughput via `task_history`.
  - 100% test pass rate across 122 mobile tests and 158 backend tests; 20/20 Expo Doctor checks passed.
  - *Documented Limitations:* The live production JavaScript SQLite connection's `PRAGMA foreign_keys` setting has not been independently interrogated at runtime (verified via isolated test database and native CLI); notification handling has repository-level idempotency and tested in-memory duplicate-tap protection, with device-level verification limited by Android's auto-dismissal of shade notifications on tap; cloud synchronization remains incomplete and is not part of Phase 7 completion.


---

## Documentation Links

- **Product Specification:** [SPEC.md](./SPEC.md) — Master product and technical requirements.
- **Development Progress:** [docs/PROGRESS.md](./docs/PROGRESS.md) — Phase status, completed features, and test records.
- **Technical Decisions:** [docs/DECISIONS.md](./docs/DECISIONS.md) — Architectural records, trade-offs, and design decisions.
- **Architecture & System Design:** [docs/notes/architecture_plan.md](./docs/notes/architecture_plan.md) — Mobile structure, backend architecture, and database schema.
- **SDK & Package Compatibility:** [docs/notes/dependencies_and_compatibility.md](./docs/notes/dependencies_and_compatibility.md) — Verified SDK 58 package versions.
- **Offline-First & Sync Architecture:** [docs/notes/offline_sync_architecture.md](./docs/notes/offline_sync_architecture.md) — SQLite persistence, sync queue, conflict resolution, and guest migration.
- **Privacy & Sensitive Data:** [docs/notes/privacy_and_security.md](./docs/notes/privacy_and_security.md) — Data minimization, bounded context, encryption, export, and deletion.
- **Widgets & Notifications Research:** [docs/notes/widget_and_notification_research.md](./docs/notes/widget_and_notification_research.md) — `react-native-android-widget`, iOS WidgetKit, exact alarms, and Doze mode mitigations.
- **EAS Update Strategy:** [docs/notes/eas_update_strategy.md](./docs/notes/eas_update_strategy.md) — Over-the-air update boundaries and runtime versioning.

---

## Getting Started

### Prerequisites
- Node.js >= 22.13.x (Node 22 / 24 LTS recommended; local environment runs Node.js v24.20.0)
- PostgreSQL 15+ (for backend persistence)
- npm or npx

### 1. Mobile Client (`mobile/`)
```bash
# Navigate to the mobile project directory
cd mobile

# Start the Expo development server
npm start

# Run on Android emulator / device
npm run android

# Run on iOS simulator / device
npm run ios

# Run TypeScript checks
npm run typecheck

# Run ESLint
npm run lint

# Run Expo Doctor diagnostics
npm run doctor
```

### 2. Backend Server (`backend/`)
```bash
# Navigate to the backend directory
cd backend

# Copy environment template
cp .env.example .env

# Generate database migrations
npm run db:generate

# Run database migrations against PostgreSQL
npm run db:migrate

# Start development server
npm run dev

# Run automated tests
npm test

# Run TypeScript check
npm run typecheck

# Run ESLint
npm run lint
```

---

## Core Principles

- **Phase-Based Development:** Work progresses strictly one phase at a time per `SPEC.md`. Later phases are never pre-emptively implemented.
- **Guest-First & Offline-First:** Users can immediately create tasks, log moods, view analytics, and set reminders locally without creating an account or needing an internet connection.
- **Dark Mode by Default:** Designed intentionally with rich dark tones, along with deliberate Light and System appearance modes.
- **AI Provider Independence:** Interactive chat uses a single user-chosen provider, while background intelligence gracefully fails over across multiple providers.
- **Privacy & Security First:** Private API credentials reside safely on the backend. AI providers receive strictly bounded context.
