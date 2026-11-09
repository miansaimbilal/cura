# Cura — AI-Powered Companion App

**Cura** is an offline-first, privacy-respecting, AI-powered task management, mood tracking, and personal reflection companion. Built with React Native, Expo SDK 52, Node.js, and local SQLite persistence, Cura pairs structured productivity with emotional awareness while maintaining strict user data sovereignty.

---

## Features

- **Offline-First Task Management**: Timed and untimed tasks, recurring schedules, reminder alerts, completion history, and deterministic sorting backed by local SQLite.
- **Categorical Mood Tracking**: 9 distinct emotional states (`happy`, `calm`, `excited`, `okay`, `tired`, `stressed`, `sad`, `anxious`, `angry`), emotion tags, notes, and interactive timeline views.
- **Deterministic Analytics**: Visual task completion rings, mood distribution donuts, and activity bar charts across Day, Week, and Month periods computed entirely on-device from SQLite.
- **AI Reflections & Multi-Provider Routing**: Intelligent context-aware reflection chat with multi-provider failover routing (Google Gemini, Groq, OpenRouter, Cloudflare Workers AI, xAI) using strictly bounded context packets (today's tasks + 3 days of moods).
- **Proactive AI Check-ins**: 7-day rolling calendar notifications for morning check-ins and evening reflections respecting quiet hours and device local timezones.
- **Native Home-Screen Widgets**: Native Android `RemoteViews` and iOS WidgetKit widgets sharing data via atomic JSON snapshots and App Groups (`group.com.cura.app`), featuring Last-Write-Wins and payload hash verification.
- **Seamless Guest Exploration & Auth Migration**: Immediate full utility in Guest mode without login; seamless one-tap in-place migration of all guest records to authenticated cloud-synced accounts upon registration.
- **Privacy Sovereignty & Pakistan Crisis Support**: Full data export (JSON & RFC 4180 CSV), database defragmentation (`VACUUM`), permanent "Delete My Data" erasure, and an integrated country-aware crisis directory featuring verified Pakistan helplines (Rescue 1122, Police 15, Edhi 115, Umang, Rozan) alongside US, UK, and international services.

---

## Tech Stack

| Domain | Technologies |
| :--- | :--- |
| **Mobile App** | React Native, Expo SDK 52/58, Expo Router v4 (file-based navigation, 6 tabs), TypeScript |
| **Mobile Database** | SQLite via `expo-sqlite`, custom transactional migration engine (`0001` through `0006`) |
| **Widgets** | Native Android Kotlin (`RemoteViews` + `AppWidgetProvider`), iOS Swift (`WidgetKit`), custom `widget-bridge` Expo module |
| **Backend** | Node.js, Express, TypeScript, PostgreSQL, Drizzle ORM |
| **AI Routing** | Multi-provider abstraction with automated retry and fallback routing |
| **Tooling & CI** | Vitest, ESLint, TypeScript Strict, EAS Build, EAS Update |

---

## Project Structure

```
Cura/
├── backend/                      # Node.js + TypeScript backend service
│   ├── src/
│   │   ├── ai/                   # AI provider routing, prompts, and failover
│   │   ├── auth/                 # JWT auth, token refresh, and registration
│   │   ├── db/                   # Drizzle ORM schema and PostgreSQL migrations
│   │   └── routes/               # REST API route handlers
│   └── tests/                    # Backend unit & integration test suites
├── mobile/                       # Expo React Native client
│   ├── app/                      # Expo Router navigation shells
│   │   ├── (auth)/               # Login & registration screens
│   │   ├── (tabs)/               # 6 main tabs: Home, Tasks, Mood, Analytics, Chat, Profile
│   │   └── _layout.tsx           # Root navigation provider tree
│   ├── assets/                   # Static icons, splash screens, and adaptive assets
│   ├── modules/
│   │   └── widget-bridge/        # Native Kotlin (Android) & Swift (iOS) widget bridge
│   ├── src/
│   │   ├── components/           # UI components (tasks, mood, charts, chat, settings, modal sheets)
│   │   ├── db/                   # SQLite client, migrations, and repositories
│   │   ├── hooks/                # Custom React hooks (useTheme, useTasks, useMood, useChat)
│   │   ├── providers/            # Context providers (ThemeProvider, AuthProvider, TaskProvider)
│   │   ├── services/             # Core services (notifications, widgets, auth, data export, crisis)
│   │   └── theme/                # Design tokens (darkColors, lightColors, typography, spacing)
│   └── tests/                    # Mobile unit, integration, and performance benchmark suites
├── docs/                         # Architecture, decisions, build, and progress documentation
│   ├── PROGRESS.md               # Phase-by-phase implementation log
│   ├── DECISIONS.md              # Architectural Decision Records (ADRs)
│   ├── BUILD.md                  # Native build & app store release instructions
│   └── OTA.md                    # EAS Update policies and publishing guide
├── eas.json                      # EAS Build & Update configuration
└── SPEC.md                       # Master product & technical specification
```

---

## Getting Started

### Prerequisites
- Node.js >= 22 LTS (tested on Node.js v24.20.0)
- PostgreSQL 15+ (for cloud backend features)
- npm or npx
- Android Studio / Android SDK (for native Android builds)

### 1. Mobile Setup (`mobile/`)
```bash
# Navigate to mobile directory
cd mobile

# Install dependencies (if needed)
npm install

# Start the Expo development server
npm start

# Run on Android connected device or emulator
npm run android

# Run typecheck (must be 0 errors)
npm run typecheck

# Run linter (must be 0 errors, 0 warnings)
npm run lint

# Run automated tests
npm test
```

### 2. Backend Setup (`backend/`)
```bash
# Navigate to backend directory
cd backend

# Setup environment variables
cp .env.example .env

# Run PostgreSQL migrations
npm run db:migrate

# Start development server
npm run dev

# Run backend tests
npm test
```

---

## Testing & Quality Assurance

Cura enforces strict quality gates across the entire codebase:

```bash
# Mobile tests (unit, integration, end-to-end, benchmarks)
npm test --prefix mobile

# Mobile TypeScript verification
npm run typecheck --prefix mobile

# Mobile linting
npm run lint --prefix mobile

# Backend tests
npm test --prefix backend

# Clean native Android prebuild verification
cd mobile && npx expo prebuild --clean --platform android --no-install
```

---

## Building Native Binaries (EAS Build)

Cura uses EAS Build for generating release packages. Read [`docs/BUILD.md`](./docs/BUILD.md) for full instructions.

- **Android Preview APK (for direct sideloading & testing):**
  ```bash
  cd mobile
  eas build --profile preview --platform android
  ```
- **Android Production AAB (for Google Play Store):**
  ```bash
  cd mobile
  eas build --profile production --platform android
  ```
- **iOS Production IPA (requires macOS & Xcode for WidgetKit target):**
  ```bash
  cd mobile
  eas build --profile production --platform ios
  ```

---

## Over-The-Air (OTA) Updates (EAS Update)

Cura uses EAS Update with the `fingerprint` runtime version policy to push instant JavaScript and styling fixes directly to devices. Read [`docs/OTA.md`](./docs/OTA.md) for complete details.

- **Publish to Preview:**
  ```bash
  cd mobile
  eas update --channel preview --message "Fix: Update chart contrast"
  ```
- **Publish to Production:**
  ```bash
  cd mobile
  eas update --channel production --message "Hotfix: Correct task sorting"
  ```
- **Rollback:**
  ```bash
  cd mobile
  eas update:re-publish --group <UPDATE_GROUP_ID> --channel production
  ```

---

## Known Platform Limitations (SPEC §18)

1. **Android Widget Action Deep Links**:
   - On Android, tapping a task checkbox or mood button on the home-screen widget opens the app via the registered deep link (`cura://widget-action`). Standard Android `RemoteViews` handles widget intent callbacks by launching the host application intent.
2. **iOS WidgetKit Extension Target**:
   - iOS WidgetKit extensions require a dedicated Xcode target (`CuraWidgetsExtension`) embedded in `Cura.app` with App Group entitlement `group.com.cura.app`. This target must be compiled via Xcode on macOS and cannot be built directly on Windows without EAS cloud build.
3. **Receipts Storage in Processed Actions (Option B)**:
   - In accordance with SPEC requirements, widget action receipts created while in guest mode permanently retain `user_id = 'guest'`. Attempting to modify historical guest receipt records upon user migration is prohibited to prevent triggering SQLite trigger conflicts (`trg_processed_actions_no_update -> RAISE(ABORT)`).

---

## Master Specification

The single source of truth for all requirements, architectural invariants, and design specifications is [SPEC.md](./SPEC.md).
