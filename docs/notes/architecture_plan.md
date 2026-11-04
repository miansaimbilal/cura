# Architecture & System Design Plan

## 1. System Overview

Cura is an AI-powered personal companion designed for task management, mood tracking, personal reflection, and analytics. The system consists of two primary subsystems:
1. **Mobile Application:** An offline-first React Native application built with Expo (SDK 58, Expo Router ~58.0.30, TypeScript, `expo-sqlite` + Drizzle ORM, and Continuous Native Generation).
2. **Backend Services:** A Node.js and TypeScript server built on **Express.js** providing optional cloud synchronization, data persistence via PostgreSQL + Drizzle ORM, multi-provider AI routing with automatic failover, context construction, and scheduled background jobs.

The application follows a **guest-first model**: users can immediately use all task management, mood logging, local notifications, widgets, and analytics offline without registering. Users can optionally create an account to unlock cross-device synchronization and cloud backups, at which point all guest data seamlessly migrates to their account.

---

## 2. Scalable Workspace & Folder Structure

```
Cura/
├── mobile/                           # React Native / Expo Client
│   ├── app/                          # Expo Router file-based routes
│   │   ├── (auth)/                   # Auth routes (login, register, forgot-password)
│   │   │   ├── login.tsx
│   │   │   └── register.tsx
│   │   ├── (tabs)/                   # Core navigation bottom tabs
│   │   │   ├── _layout.tsx           # Tab bar styling, theme integration, active icons
│   │   │   ├── index.tsx             # Home / Today dashboard (greetings, quick stats, overview)
│   │   │   ├── tasks.tsx             # Task management (filters, timed/untimed list, add/edit)
│   │   │   ├── mood.tsx              # Mood logging & history
│   │   │   ├── analytics.tsx         # Visual analytics dashboard (charts, rings, trends)
│   │   │   ├── chat.tsx              # AI companion chat interface
│   │   │   └── settings.tsx          # Settings, theme picker, notification switches, AI config
│   │   ├── modal/                    # Modals for quick mood log, task creation, quote view
│   │   └── _layout.tsx               # Root layout (ThemeProvider, AuthProvider, ErrorBoundary)
│   ├── src/
│   │   ├── components/               # Modular UI components
│   │   │   ├── ui/                   # Design system primitives (Button, Card, Input, Badge, Modal)
│   │   │   ├── charts/               # MoodTrendChart, MoodDistributionDonut, TaskProgressRing, TaskActivityBarChart
│   │   │   ├── tasks/                # TaskItem, TaskForm, TaskFilter
│   │   │   ├── mood/                 # MoodSelector, MoodCard, MoodTimeline
│   │   │   ├── chat/                 # ChatBubble, ChatInput, TypingIndicator, QuotaNotice
│   │   │   └── layout/               # ScreenContainer, Header, TabHeader
│   │   ├── constants/                # Design tokens
│   │   │   ├── colors.ts             # Semantic color tokens for Dark & Light modes
│   │   │   ├── typography.ts         # Font sizing, font weights, line heights, tabular figures
│   │   │   ├── spacing.ts            # 4pt/8pt grid spacing scale, radii, elevations
│   │   │   └── moods.ts              # Mood categories, icons, color mappings
│   │   ├── context/                  # Global application states
│   │   │   ├── ThemeContext.tsx      # Dark / Light / System state and token provider
│   │   │   ├── AuthContext.tsx       # User session state & token storage
│   │   │   └── NotificationContext.tsx# In-app notification state & listener hooks
│   │   ├── hooks/                    # Custom React hooks
│   │   │   ├── useTheme.ts           # Access current theme tokens and updater
│   │   │   ├── useTasks.ts           # Task queries, mutations, optimistic updates
│   │   │   ├── useMood.ts            # Mood logging, history retrieval
│   │   │   ├── useAnalytics.ts       # Chart data transformations & filters
│   │   │   └── useChat.ts            # Streaming/chat messages, retry logic, provider info
│   │   ├── services/                 # External & native integrations
│   │   │   ├── api/                  # Axios/fetch client with auth token interceptor
│   │   │   ├── storage/              # expo-secure-store (tokens) & AsyncStorage/SQLite (offline)
│   │   │   ├── notifications/        # Local notification scheduler & channel management
│   │   │   └── widget/               # Native bridge & shared storage writer for home-screen widgets
│   │   ├── types/                    # Shared client TypeScript types
│   │   │   ├── task.ts
│   │   │   ├── mood.ts
│   │   │   ├── chat.ts
│   │   │   └── analytics.ts
│   │   └── utils/                    # Utility functions (date math, formatters, validation)
│   ├── assets/                       # Static images, splash screens, icons, fonts
│   ├── app.json                      # Expo configuration & plugins
│   ├── eas.json                      # EAS build & update profiles
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                          # Node.js & TypeScript Server
│   ├── src/
│   │   ├── config/                   # Environment variables, Zod schema validation
│   │   ├── db/                       # Database layer
│   │   │   ├── schema/               # Drizzle/Prisma schema definitions
│   │   │   ├── migrations/           # SQL migration files
│   │   │   └── index.ts              # Database connection pool
│   │   ├── modules/                  # Domain-driven feature modules
│   │   │   ├── auth/                 # Authentication controller, service, token verification
│   │   │   ├── users/                # User profile & preferences
│   │   │   ├── tasks/                # Task CRUD, lifecycle events, date filters
│   │   │   ├── mood/                 # Mood logging, aggregation queries, trend data
│   │   │   ├── analytics/            # Deterministic statistics calculations (rates, distributions)
│   │   │   ├── chat/                 # Conversation management, context packaging, chat handler
│   │   │   ├── ai/                   # AI Provider abstraction & routing
│   │   │   │   ├── interfaces.ts     # IAIProvider contract
│   │   │   │   ├── providers/        # GeminiProvider, GroqProvider, OpenRouterProvider
│   │   │   │   ├── contextBuilder.ts # Context packager (tasks, moods, past summaries)
│   │   │   │   ├── failoverEngine.ts # Background AI multi-provider retry & fallback engine
│   │   │   │   └── safetyGuard.ts    # Crisis / self-harm detection & supportive guidance
│   │   │   ├── jobs/                 # Background workers
│   │   │   │   ├── checkinScheduler.ts# Morning and evening check-in triggers
│   │   │   │   ├── summaryWorker.ts  # Daily summary and mood analysis generator
│   │   │   │   └── quoteRotator.ts   # 5-hour personalized motivational quote rotation
│   │   │   └── notifications/        # Push notification service (Expo Push API dispatcher)
│   │   ├── middleware/               # Auth, rate-limiting, error handler, request logger
│   │   ├── types/                    # Backend TypeScript interfaces
│   │   ├── app.ts                    # Express app bootstrap
│   │   └── server.ts                 # HTTP server listener
│   ├── tests/                        # Unit and integration test suites
│   ├── .env.example
│   ├── tsconfig.json
│   └── package.json
│
├── docs/                             # Project documentation
│   ├── DECISIONS.md                  # Record of all architectural and technical decisions
│   ├── PROGRESS.md                   # Real-time phase tracking and test results
│   └── notes/                        # Research and design documentation
├── SPEC.md                           # Master product specification
└── README.md
```

---

## 3. Database Schema Design (PostgreSQL)

### Core Tables:
1. **`users`**
   - `id`: UUID (Primary Key)
   - `email`: VARCHAR(255) (Unique)
   - `password_hash`: VARCHAR(255)
   - `display_name`: VARCHAR(100)
   - `timezone`: VARCHAR(50) (e.g., 'America/New_York')
   - `created_at`, `updated_at`: TIMESTAMPTZ

2. **`user_preferences`**
   - `user_id`: UUID (Foreign Key $\rightarrow$ users.id, Primary Key)
   - `theme_mode`: VARCHAR(10) ('dark' | 'light' | 'system', default 'dark')
   - `selected_chat_provider`: VARCHAR(50) (default 'gemini')
   - `selected_chat_model`: VARCHAR(50) (default 'gemini-1.5-flash')
   - `notify_timed_tasks`: BOOLEAN (default true)
   - `notify_eod_tasks`: BOOLEAN (default true)
   - `notify_morning_checkin`: BOOLEAN (default true)
   - `notify_evening_checkin`: BOOLEAN (default true)
   - `notify_accomplishments`: BOOLEAN (default true)
   - `notify_ai_insights`: BOOLEAN (default true)
   - `morning_checkin_time`: TIME (default '08:30:00')
   - `evening_checkin_time`: TIME (default '20:30:00')
   - `eod_reminder_time`: TIME (default '21:00:00')
   - `quiet_hours_start`: TIME NULL
   - `quiet_hours_end`: TIME NULL

3. **`tasks`**
   - `id`: UUID (Primary Key)
   - `user_id`: UUID (Foreign Key $\rightarrow$ users.id)
   - `title`: VARCHAR(255) (Not Null)
   - `description`: TEXT NULL
   - `due_date`: DATE NULL
   - `due_time`: TIME NULL
   - `is_timed`: BOOLEAN (default false)
   - `status`: VARCHAR(20) ('pending' | 'completed' | 'postponed' | 'cancelled')
   - `completed_at`: TIMESTAMPTZ NULL
   - `postponed_at`: TIMESTAMPTZ NULL
   - `created_at`, `updated_at`: TIMESTAMPTZ

4. **`mood_entries`**
   - `id`: UUID (Primary Key)
   - `user_id`: UUID (Foreign Key $\rightarrow$ users.id)
   - `mood_type`: VARCHAR(30) ('happy' | 'excited' | 'calm' | 'okay' | 'tired' | 'stressed' | 'sad' | 'anxious' | 'angry')
   - `note`: TEXT NULL
   - `tags`: TEXT[] (default '{}')
   - `logged_at`: TIMESTAMPTZ (Not Null)
   - `created_at`: TIMESTAMPTZ

5. **`conversations`**
   - `id`: UUID (Primary Key)
   - `user_id`: UUID (Foreign Key $\rightarrow$ users.id)
   - `title`: VARCHAR(255)
   - `conversation_type`: VARCHAR(30) ('general' | 'checkin_morning' | 'checkin_evening' | 'reflection')
   - `created_at`, `updated_at`: TIMESTAMPTZ

6. **`messages`**
   - `id`: UUID (Primary Key)
   - `conversation_id`: UUID (Foreign Key $\rightarrow$ conversations.id)
   - `sender`: VARCHAR(20) ('user' | 'assistant' | 'system')
   - `content`: TEXT (Not Null)
   - `provider_used`: VARCHAR(50) NULL
   - `model_used`: VARCHAR(50) NULL
   - `created_at`: TIMESTAMPTZ

7. **`daily_summaries`**
   - `id`: UUID (Primary Key)
   - `user_id`: UUID (Foreign Key $\rightarrow$ users.id)
   - `date`: DATE (Not Null)
   - `summary_text`: TEXT (Not Null)
   - `tasks_completed_count`: INTEGER (default 0)
   - `tasks_total_count`: INTEGER (default 0)
   - `mood_distribution`: JSONB (default '{}')
   - `provider_used`: VARCHAR(50)
   - `created_at`: TIMESTAMPTZ

8. **`ai_insights`**
   - `id`: UUID (Primary Key)
   - `user_id`: UUID (Foreign Key $\rightarrow$ users.id)
   - `insight_type`: VARCHAR(30) ('mood_pattern' | 'task_productivity' | 'checkin_followup')
   - `content`: TEXT (Not Null)
   - `is_dismissed`: BOOLEAN (default false)
   - `created_at`: TIMESTAMPTZ

9. **`quote_pool` & `user_active_quote`**
   - Stores motivational quotes for widgets and app greetings, tracking last displayed timestamp to enforce ~5-hour rotation without repetition.

---

## 4. Multi-Provider AI Architecture

```
                       +-----------------------------+
                       |      Client Application     |
                       +--------------+--------------+
                                      |
                     REST / WebSocket API Request
                                      v
                       +-----------------------------+
                       |       Backend API Server    |
                       +--------------+--------------+
                                      |
              +-----------------------+-----------------------+
              |                                               |
     [Interactive Chat]                             [Background Operations]
              |                                               |
              v                                               v
     +-----------------+                             +-----------------+
     | Single Provider |                             | Failover Engine |
     | (e.g., Gemini)  |                             | (Priority List) |
     +--------+--------+                             +--------+--------+
              |                                               |
   Success?   |   Rate Limit?                      Try 1:     | Gemini
      |       |        |                           Fail?      v
      v       |        v                           Try 2:   Groq
  Respond to  |  Return 429 Quota Notice           Fail?      v
    Client    |  Preserve client draft             Try 3:   OpenRouter / Cloudflare
              |  Display reset window                         |
              |                                               v
              +-------------------------------------> Store in Database
```

### Key Principles:
- **Zero Client Keys:** Client never holds AI API keys.
- **Provider Abstraction:** Universal interface `generateChat()`, `generateSummary()`, `generateStructured()`.
- **Interactive Isolation:** Interactive chat stays on the chosen provider to preserve conversational voice. If rate-limited, user is informed with clear countdown/notice and unlost message.
- **Background Failover:** Summaries, quotes, and pattern analysis cascade through providers automatically upon retryable errors (timeouts, HTTP 429/503).
