# Personal Companion — Project Specification

**Project type:** AI-powered task manager, mood tracker, and personal companion
**Mobile framework:** React Native + Expo
**Language:** TypeScript
**Default theme:** Dark
**Additional themes:** Light and System
**Specification status:** Initial version

This document is the single source of truth for the product requirements,
architecture, design direction, and development process.

The coding agent must follow this specification throughout development.
If a requirement changes, update this document and record the decision.

---

# 1. AGENT OPERATING RULES

These rules apply throughout the entire project.

## 1.1 Phase-based development

Development must happen in separate phases.

- Complete only the phase explicitly requested by the user.
- Never start a later phase without permission.
- Read this specification before starting each phase.
- Read the specific sections mentioned in the phase prompt.
- Inspect the existing code before making changes.
- Do not rebuild working functionality unnecessarily.
- Do not introduce unrelated features.
- Do not skip acceptance criteria.
- Do not claim something works without testing it.

Each phase prompt will specify:
- What the agent should build.
- Which sections of SPEC.md it should read.
- Which features are included.
- Expected implementation details.
- Acceptance criteria.
- What must not be implemented yet.

## 1.2 Documentation requirements

Maintain these files throughout development:

- `docs/PROGRESS.md`
- `docs/DECISIONS.md`
- `docs/notes/`

### PROGRESS.md

Update this file after every phase.

Include:
- Current phase.
- Completed functionality.
- Files created or modified.
- Tests performed.
- Test results.
- Known issues.
- Remaining work.
- Suggested next phase.

### DECISIONS.md

Record important technical and product decisions.

For every significant decision, document:
- The decision.
- Why it was made.
- Alternatives considered.
- Any important limitations.

### Notes

Use `docs/notes/` for additional technical research,
API documentation notes, architectural explanations,
and platform-specific implementation details.

## 1.3 Coding standards

- Use TypeScript with strict mode.
- Write modular, maintainable code.
- Use reusable components.
- Keep business logic separate from UI components.
- Avoid unnecessary dependencies.
- Validate all external input.
- Handle loading, empty, offline, and error states.
- Use proper error handling.
- Write tests for important functionality.
- Do not hardcode user data or analytics.
- Do not expose API keys or secrets in the mobile application.
- Avoid large unnecessary refactors.
- Follow the existing architecture unless there is a documented reason to change it.

## 1.4 Research and compatibility

Before implementing platform-specific features, verify current official documentation.

Pay particular attention to:
- Expo SDK compatibility.
- React Native library compatibility.
- Android and iOS notification restrictions.
- Native home-screen widget requirements.
- EAS Build and EAS Update compatibility.
- AI provider APIs, quotas, and rate limits.

Do not assume that a feature works with Expo simply because it works in native Android or iOS development.

Important OTA limitation:

EAS Update can deliver compatible JavaScript, styling, and asset changes.

It cannot add or modify native modules, native permissions,
native configuration, or native widget implementations.

Changes requiring native code generally require a new native build.

---

# 2. PRODUCT VISION

Build a personal companion application that helps users:

1. Manage daily tasks.
2. Track their moods.
3. Understand their productivity and mood patterns.
4. Reflect on their day through AI conversations.
5. Receive helpful reminders and check-ins.
6. Understand their progress through beautiful analytics.

The app should combine the usefulness of a task manager,
the simplicity of a mood journal, and the conversational
experience of an AI companion.

It should feel calm, modern, personal, and easy to use.

## 2.1 Core principles

### Reliability first

Task management and mood tracking must work even when AI services
are unavailable.

### Personalization

The app should feel personal without becoming complicated.

### Privacy

Users should understand what information is stored and
what information is sent to AI providers.

### Provider independence

The application must not depend on one AI provider.

### Persistent context

Important information must be stored in the application's
database rather than relying on an AI model's memory.

### Non-judgmental experience

The app should encourage users without making them feel guilty
about incomplete tasks, missed goals, or difficult days.

### Visual quality

The UI must look polished and intentional.
Visual design is a core requirement, not something to add at the end.

---

# 3. TECHNICAL DIRECTION

## 3.1 Mobile application

Preferred stack:

- React Native.
- Expo.
- TypeScript.
- Expo Router.
- EAS Build.
- EAS Update.

Use the current stable Expo SDK compatible with the required features.

The agent must verify package compatibility before installing
libraries that require native functionality.

## 3.2 Backend

Use a separate backend for:

- Authentication.
- User data.
- Database operations.
- AI provider communication.
- AI context construction.
- Background AI jobs.
- Scheduled check-ins.
- Provider failover.
- Secure API key storage.

Preferred starting direction:

- Node.js.
- TypeScript.
- PostgreSQL.

The final backend architecture should be selected and documented
during Phase 0.

## 3.3 Architecture

Keep the application modular.

Separate:

- Navigation.
- UI components.
- Feature logic.
- API communication.
- Data persistence.
- AI provider integrations.
- Notifications.
- Theme management.
- Analytics calculations.
- Native platform integrations.

Avoid putting the entire application into a few large files.

## 3.4 Security

- Never expose private API keys in the mobile application.
- Never commit secrets to GitHub.
- Use environment variables on the backend.
- Authenticate and authorize database operations.
- Validate requests on the server.
- Protect user-specific data.
- Do not log sensitive conversation content unnecessarily.

---

# 4. UI/UX AND DESIGN SYSTEM

This section is extremely important.

The application must have a premium, modern, visually appealing interface.

Do not create a generic-looking dashboard.

The design should feel like a carefully designed modern mobile product.

## 4.1 Overall visual direction

The visual direction should be:

- Modern.
- Minimal.
- Premium.
- Calm.
- Friendly.
- Intuitive.
- Consistent.
- Visually balanced.

Use:
- Rounded cards.
- Consistent spacing.
- Beautiful typography.
- Subtle borders.
- Carefully selected accent colours.
- Smooth transitions.
- Clean icons.
- Attractive charts.
- Well-designed empty states.

Avoid:
- Overcrowded screens.
- Excessive gradients.
- Too many different colours.
- Excessive glassmorphism.
- Unnecessary animations.
- Tiny text.
- Poor contrast.
- Generic default component styling.
- Decorative charts without meaningful data.

The app should not look like a spreadsheet or an enterprise
management dashboard.

It should feel like a personal companion.

## 4.2 Theme system

The application must support three theme modes:

1. Dark.
2. Light.
3. System.

### Default theme

Dark mode must be enabled by default for new users.

### Theme persistence

- Save the user's theme preference.
- Restore it when the app launches.
- System mode should follow the device appearance.
- Theme changes should apply immediately.

### Dark mode

Use a deep charcoal or near-black background.

Avoid using pure black for every surface.

Use subtle differences between:
- Main background.
- Cards.
- Elevated cards.
- Input fields.
- Navigation surfaces.

Use soft white for primary text and muted grey for secondary text.

Use a restrained violet or blue-violet accent colour.

Use green for positive/completed states,
amber for attention states,
and red for destructive or genuinely critical states.

### Light mode

Use a soft off-white background.

Cards should use white or near-white surfaces.

Use dark charcoal for primary text and accessible grey
for secondary text.

Maintain the same visual identity and accent colours as dark mode.

Light mode must be designed intentionally.
It must not simply be a colour inversion of dark mode.

### Theme tokens

All colours must be managed through centralized theme tokens.

Do not hardcode colours throughout individual screens.

Create semantic tokens for:
- Background.
- Surface.
- Elevated surface.
- Primary text.
- Secondary text.
- Muted text.
- Border.
- Accent.
- Success.
- Warning.
- Error.
- Chart colours.
- Disabled states.

## 4.3 Typography

Use a clean, modern, readable font system.

Define consistent typography styles for:

- Screen titles.
- Section headings.
- Card headings.
- Body text.
- Secondary text.
- Labels.
- Buttons.
- Numbers and statistics.

Important numbers such as task counts and percentages
should be visually prominent.

Use tabular numerals for statistics where supported.

## 4.4 Spacing and layout

Create a consistent spacing scale.

Use consistent:
- Card padding.
- Screen margins.
- Section spacing.
- Button heights.
- Corner radii.
- Input heights.

Layouts must adapt to different screen sizes.

Respect safe areas and device navigation areas.

## 4.5 Animations and interactions

Use subtle animations for:

- Completing a task.
- Changing a mood.
- Opening cards or details.
- Switching tabs.
- Updating progress.
- Selecting chart periods.

Animations should be smooth and short.

Do not make the interface feel slow.

Support reduced-motion preferences where practical.

## 4.6 Accessibility

- Maintain good contrast.
- Use readable text sizes.
- Add accessible labels to icon-only buttons.
- Make controls easy to tap.
- Do not communicate information using colour alone.
- Provide accessible summaries for charts.
- Support screen readers for important interactions.

---

# 5. APPLICATION NAVIGATION AND SCREENS

The application should have simple navigation.

The final navigation structure can be refined during implementation.

Required main areas:

1. Home.
2. Tasks.
3. Mood.
4. Analytics.
5. AI Chat.
6. Settings.

## 5.1 Home screen

The home screen should provide a quick overview of the user's day.

Include:

### Greeting

- Friendly greeting.
- Current date.
- Context-aware AI greeting or check-in entry point.

### Today's progress

- Number of completed tasks.
- Number of remaining tasks.
- Daily progress indicator.
- Quick access to task list.

### Tasks overview

Show:
- Upcoming tasks.
- Overdue tasks.
- Recently completed tasks.

Do not show too many tasks on the home screen.

Provide a way to open the complete task list.

### Mood overview

Show:
- Latest mood entry.
- Quick mood logging action.
- Small mood summary.

### AI companion section

Show a friendly entry point into the AI conversation.

It may include:
- A contextual greeting.
- A recent insight.
- A small accomplishment acknowledgement.

### Dashboard layout

The home screen should feel balanced.

Do not place every possible statistic and chart on the home screen.

Keep detailed analytics on the dedicated Analytics screen.

## 5.2 Tasks screen

Provide:
- Task list.
- Add task button.
- Task details.
- Edit functionality.
- Complete functionality.
- Delete functionality.
- Status filters.
- Date filters.
- Timed and untimed task distinction.

## 5.3 Mood screen

Provide:
- Quick mood selection.
- Optional note.
- Optional tags.
- Mood history.
- Date filters.
- Edit and delete functionality.

## 5.4 Analytics screen

Provide a visually attractive analytics dashboard.

Required features:
- Day, week, and month filters.
- Mood analytics.
- Task analytics.
- Progress charts.
- Summary cards.
- AI insights when available.

See Section 13 for detailed chart requirements.

## 5.5 AI Chat screen

Provide:
- Conversation interface.
- Message history.
- Loading states.
- Retry functionality.
- Error handling.
- Context-aware responses.
- Provider availability information when needed.

## 5.6 Settings screen

Provide:
- Theme selection.
- Notification preferences.
- AI provider settings.
- Privacy information.
- Account settings where applicable.
- Data controls.
- Application information.

---

# 6. TASK MANAGEMENT

## 6.1 Task creation

Users must be able to create tasks.

A task should support:

- Title.
- Optional description.
- Optional date.
- Optional time.
- Status.
- Creation timestamp.
- Updated timestamp.
- Completion timestamp.
- User ID.

Optional priority or category can be added if it improves
the user experience without making task creation complicated.

## 6.2 Timed tasks

Users can assign a specific date and time to a task.

When the selected time arrives:
- Send a reminder notification.
- Respect notification permissions.
- Respect notification settings.
- Use the user's local time zone.

If a task is edited, update its scheduled reminder.

If a task is completed or deleted, cancel its pending reminder.

## 6.3 Untimed tasks

Users can create tasks without assigning a time.

Incomplete untimed tasks should be included in an end-of-day reminder.

The end-of-day reminder must be configurable or have
a clearly documented default time.

Do not send duplicate reminders for the same task and day.

## 6.4 Task completion

Users should be able to:

- Mark a task as complete.
- Undo completion where appropriate.
- Edit a task.
- Delete a task.
- Postpone a task.

Completed tasks must remain available in task history.

Do not automatically erase incomplete tasks when a new day starts.

## 6.5 Task history

Maintain task history.

Users should be able to see:
- Previously completed tasks.
- Completion dates.
- Incomplete tasks.
- Overdue tasks.
- Postponed tasks.

Define consistent status rules so analytics remain accurate.

## 6.6 Reliability

Handle:
- Notification permission denial.
- Device restarts.
- Time-zone changes.
- Date changes.
- Edited tasks.
- Deleted tasks.
- Completed tasks.
- Duplicate scheduling attempts.

Remember that operating systems may restrict notification
delivery because of battery optimization or permissions.

Do not guarantee notification delivery when the OS cannot guarantee it.

---

# 7. MOOD TRACKING

## 7.1 Mood logging

Users should be able to log their mood at any time.

Mood logging should be quick and simple.

Use an understandable set of mood options.

The exact mood vocabulary should be finalized during UI implementation.

Possible examples:

- Happy.
- Excited.
- Calm.
- Okay.
- Tired.
- Stressed.
- Sad.
- Anxious.
- Angry.

The labels should be non-judgmental.

Allow optional:
- Notes.
- Tags.
- Context.

Users should be able to log multiple moods per day.

## 7.2 Mood history

Maintain a chronological history.

Users should be able to:
- View previous mood entries.
- Filter by day, week, or month.
- Edit an entry.
- Delete an entry.

Do not treat a missing mood entry as a neutral mood.

## 7.3 Mood statistics

Calculate:

- Most frequently logged mood.
- Mood distribution.
- Number of mood logs.
- Mood trends.
- Changes over time.
- Optional time-of-day patterns when enough data exists.

## 7.4 AI mood analysis

The AI may analyze mood logs and conversation context.

It can identify possible patterns and summarize them.

For example:

"You logged more tired moods this week than last week."

Or:

"You mentioned having a busy schedule on several days."

Important:
- Clearly distinguish user-reported moods from AI interpretations.
- Do not diagnose mental health conditions.
- Do not claim clinical accuracy.
- Do not invent mood entries.
- Allow users to correct AI interpretations.

---

# 8. AI COMPANION

## 8.1 Purpose

The AI companion should help users reflect on their day,
discuss their feelings, and understand their progress.

It should communicate naturally and empathetically.

It should not sound like a robotic productivity manager.

## 8.2 Chat functionality

Users can discuss:

- Their day.
- Their tasks.
- Their mood.
- Personal reflections.
- Difficult situations.
- Accomplishments.
- Plans and goals.

The AI should use relevant app context when answering.

## 8.3 Opening greeting

Whenever the user opens the app, provide a friendly greeting
or a check-in entry point.

Avoid forcing a full-screen conversation every time.

The greeting should use relevant context where available.

Avoid repeating identical greetings.

## 8.4 Twice-daily check-ins

Support two scheduled check-ins per day.

Suggested categories:
- Morning check-in.
- Evening check-in.

Users should be able to configure their times.

When a user clicks a check-in notification,
open the relevant AI conversation.

Store check-in events so the app can identify which
conversation belongs to which check-in.

Respect notification settings and quiet hours.

## 8.5 AI appreciation

The AI should occasionally appreciate small accomplishments.

Examples:
- Completing a task.
- Making progress on something difficult.
- Returning to the app after a break.
- Taking time to log a mood.
- Completing a personal goal.

Appreciation should be specific and genuine.

Do not generate exaggerated praise for every interaction.

Do not make users feel guilty when they do not complete tasks.

## 8.6 Context awareness

The AI should receive relevant information from the database.

Possible context:
- Today's tasks.
- Task completion history.
- Recent mood entries.
- Recent conversations.
- Daily summaries.
- User preferences.

Do not send the entire database with every message.

Build a controlled context package based on relevance.

## 8.7 Persistent memory

Do not rely on the AI provider's internal memory.

Store important context independently.

Use structured records and summaries that can be supplied
to any supported AI provider.

The user should not lose their context when changing models.

## 8.8 AI safety

The AI is a supportive companion, not a medical professional.

It must not:
- Diagnose medical or mental health conditions.
- Present guesses as facts.
- Claim to provide emergency monitoring.
- Invent user history.
- Silently overwrite user-authored records.

When a user expresses immediate danger or self-harm intent,
respond supportively and encourage contacting a trusted person
or appropriate local emergency support.

---

# 9. AI PROVIDERS AND MODEL ROUTING

This is a major architectural requirement.

The application must support multiple AI providers.

Potential providers include:

- Google Gemini.
- Groq.
- Cloudflare Workers AI.
- OpenRouter.
- Other compatible providers.

The system must be designed so new providers can be added
without rewriting the entire application.

Verify each provider's current API, models, limits, and capabilities
before implementing it.

## 9.1 Provider abstraction

Create a common provider interface.

The rest of the application should not depend directly
on provider-specific request or response formats.

Use provider adapters where necessary.

Support capability declarations such as:
- Chat.
- Structured output.
- Summarization.
- Background analysis.

Do not assume every model supports every capability.

## 9.2 Interactive chat provider

Interactive AI chat should use one selected provider/model.

Do not silently switch providers in the middle of a conversation.

If the provider reaches its quota:
- Inform the user.
- Explain that the selected provider is temporarily unavailable.
- Show a reset time only when reliable information exists.
- Preserve the unsent message.
- Allow the user to retry later.

Do not pretend that the application can bypass provider quotas.

## 9.3 Background AI provider failover

Background AI operations should support multiple providers.

Examples:
- Daily summaries.
- Mood analysis.
- Quote generation.
- Task insights.
- Accomplishment messages.

If one provider fails because of a retryable issue,
the system may try the next configured provider.

Use:
- Error classification.
- Timeouts.
- Bounded retries.
- Provider priority.
- Rate-limit handling.
- Job status tracking.

Do not retry indefinitely.

Do not fail over for invalid input or other non-retryable errors.

## 9.4 API key security

All private provider credentials must be stored securely
on the backend.

Never expose them in:
- React Native code.
- Public environment variables.
- Client-side configuration.
- GitHub repositories.

## 9.5 Provider settings

Allow configuration of:
- Provider.
- Model.
- Provider availability.
- Background provider priority where appropriate.

If users can provide their own API keys,
store and validate them securely on the backend.

Never display complete secrets after they have been saved.

---

# 10. DATABASE AND DATA PERSISTENCE

The application must maintain its own persistent data.

Suggested record groups:

- Users.
- Profiles.
- Tasks.
- Mood entries.
- Conversations.
- Messages.
- Daily summaries.
- AI insights.
- Check-in schedules.
- Check-in events.
- Notification preferences.
- Provider configurations.
- Background job records.

The final database schema should be documented before implementation.

## 10.1 Data separation

Keep these categories separate:

### User-authored data

Examples:
- Tasks.
- Mood entries.
- Notes.
- Chat messages.
- Preferences.

### Derived summaries

Examples:
- Daily summaries.
- Weekly summaries.
- Task statistics.

### AI interpretations

Examples:
- Mood patterns.
- Suggestions.
- AI-generated insights.

AI interpretations must never silently overwrite
user-authored information.

## 10.2 Context portability

All important user context must be provider-independent.

Changing from Gemini to Groq, for example,
must not require recreating the user's history.

Use structured data and summaries.

## 10.3 Privacy controls

Explain:
- What information is stored.
- What information is sent to AI providers.
- Which provider receives a request.
- How users can export their information.
- How users can delete their information.

Do not claim that data has been deleted from a third-party
AI provider unless the provider actually supports it
and the deletion has been verified.

---

# 11. NOTIFICATIONS

Provide individual notification controls.

Required categories:

1. Timed task reminders.
2. End-of-day task reminders.
3. Morning AI check-in.
4. Evening AI check-in.
5. Accomplishment notifications.
6. AI insight notifications.

Each category must have its own toggle.

Users must be able to disable one category without
disabling all other notifications.

## 11.1 Notification behaviour

- Respect the user's local time zone.
- Respect notification permissions.
- Avoid duplicate notifications.
- Update scheduled reminders when settings change.
- Cancel notifications when their related task is completed or deleted.
- Handle device restarts and rescheduling.
- Provide a clear explanation when permission is denied.

Quiet hours should be supported if included in the agreed implementation.

---

# 12. HOME-SCREEN WIDGETS

The application should eventually support two home-screen widgets.

## 12.1 Task widget

The task widget should allow users to:

- View today's tasks.
- See task status.
- Complete tasks without opening the app.
- Edit tasks where the platform supports it.

## 12.2 Mood widget

The mood widget should allow users to:

- Select their current mood.
- Log a mood without opening the full app.

## 12.3 Personalized quotes

Both widgets should support a personalized motivational quote.

Requirements:
- Change approximately every five hours.
- Avoid recently repeated quotes.
- Use a local fallback when offline.
- Do not display an empty quote area when content is unavailable.

## 12.4 Native implementation requirements

Widgets are native platform features.

Verify Android and iOS requirements separately.

Do not assume ordinary React Native components can
be placed directly on the home screen.

Document:
- Native dependencies.
- Data-sharing approach.
- Supported widget interactions.
- Platform-specific limitations.
- Build requirements.

Native widget changes require a new native build.

If an interaction is not supported on a platform,
provide the best available fallback and document it honestly.

---

# 13. ANALYTICS AND CHARTS

Analytics are a major part of the application.

They must be attractive, understandable, and genuinely useful.

Do not create charts just to fill space.

Every chart must communicate meaningful information.

## 13.1 Analytics overview

The analytics screen should provide:

- Day filter.
- Week filter.
- Month filter.
- Summary cards.
- Mood analytics.
- Task analytics.
- Progress charts.
- AI insights when available.

The layout should adapt to small mobile screens.

## 13.2 Mood trend chart

Use a line chart or area chart.

Show how logged moods change over time.

Requirements:
- Clear date labels.
- Understandable mood values.
- Useful tooltips.
- Smooth but restrained animation.
- No misleading connection across missing data.

The chart should make it easy to understand changes
without requiring technical knowledge.

## 13.3 Mood distribution chart

Use a donut/circle chart.

Show how many times each mood was logged
during the selected period.

Include:
- Mood labels.
- Counts.
- Percentages.
- Clear legend.
- Selected segment details.

Do not use too many categories in one chart.

## 13.4 Task completion progress

Use a circular progress indicator or progress ring.

Show:
- Completed tasks.
- Total tasks.
- Completion percentage.

The calculation must use a clearly defined set of tasks.

Do not count cancelled tasks as incomplete tasks unless
the analytics definition explicitly requires it.

## 13.5 Task activity chart

Use a bar chart to show task activity across days.

Possible information:
- Tasks completed per day.
- Tasks created per day.
- Daily completion trends.

Make the selected date or period clear.

## 13.6 Summary cards

Include useful cards such as:

- Tasks completed.
- Tasks remaining.
- Completion percentage.
- Mood logs.
- Most frequent mood.
- Daily activity.

Do not display too many metrics simultaneously.

Prioritize the most useful information.

## 13.7 Chart appearance

Charts must look good in both themes.

Requirements:
- Readable labels.
- Proper contrast.
- Consistent chart colours.
- Attractive tooltips.
- Responsive sizing.
- Minimal unnecessary gridlines.
- Appropriate legends.
- Accessible text descriptions.

Avoid:
- 3D charts.
- Excessive colours.
- Overly complex legends.
- Decorative chart animations.
- Tiny labels.
- Misleading scales.

## 13.8 Analytics accuracy

Analytics must be calculated from actual stored records.

Do not use AI to calculate basic counts or percentages
when deterministic calculations are possible.

Use consistent local date boundaries.

Do not treat missing mood logs as neutral moods.

Define all percentages clearly.

For example, task completion rate must specify
which tasks are included in its denominator.

## 13.9 Empty states

When insufficient data exists:
- Explain why the chart is empty.
- Encourage the user to log information.
- Do not generate fake statistics.
- Do not show meaningless zero-filled charts when a useful
  empty state would be clearer.

## 13.10 Suggested analytics screen layout

A possible layout:

1. Screen title.
2. Day / Week / Month selector.
3. Key metric cards.
4. Mood trend chart.
5. Mood distribution donut.
6. Task completion progress ring.
7. Task activity bar chart.
8. AI insight section.

The final arrangement should be optimized for mobile usability.

---

# 14. SETTINGS AND PERSONALIZATION

Settings must include:

## Appearance

- Dark mode.
- Light mode.
- System mode.

## Notifications

Individual toggles for each notification category.

## AI settings

- Selected chat provider.
- Selected chat model.
- Provider connection status.
- Background provider configuration where supported.

## Privacy

- Data information.
- Data export.
- Data deletion.
- AI provider information.

## General

- Account settings.
- Application version.
- About information.

Do not make the application dependent on an AI call
just to render its main interface.

---

# 15. OTA UPDATES AND BUILDS

Use EAS Build and EAS Update where appropriate.

Configure:
- Development environment.
- Preview environment.
- Production environment.
- Update channels.
- Runtime version compatibility.

Test updates before relying on them.

Document which changes can be delivered OTA.

Remember:

JavaScript and compatible asset changes may be delivered OTA.

Native module changes, permissions, native configuration,
and widget implementations require a new native build.

Backend deployments are separate from mobile OTA updates.

Never expose production secrets in client-side configuration.

---

# 16. TESTING AND QUALITY ASSURANCE

Testing is required throughout development.

Include:

## Code quality

- TypeScript type checking.
- Linting.
- Formatting.

## Unit tests

Test:
- Task status rules.
- Date and time handling.
- Analytics calculations.
- Mood distribution.
- Provider routing.
- Failover rules.
- Context construction.

## Backend tests

Test:
- Authentication.
- Authorization.
- Database operations.
- Provider errors.
- API validation.
- Background jobs.

## UI testing

Test:
- Task creation and completion.
- Mood logging.
- Analytics screens.
- AI chat.
- Theme switching.
- Notification settings.

## Platform testing

Test on Android.

Verify iOS-specific behaviour separately before claiming iOS support.

## Visual testing

Check:
- Dark mode.
- Light mode.
- Small screens.
- Large screens.
- Empty states.
- Loading states.
- Error states.
- Accessibility.

Do not commit secrets or real API keys in test fixtures.

---

# 17. DEVELOPMENT PHASES

The project must be built in the following phases.

The user will provide a separate prompt for each phase.

Complete only the requested phase.

## PHASE 0 — REPOSITORY INSPECTION AND PLANNING

Read:
Sections 1, 2, 3, 15, 16, and 17.

Goals:
- Inspect the repository.
- Confirm the Expo and React Native approach.
- Verify SDK and package compatibility.
- Propose the folder structure.
- Propose the backend architecture.
- Identify database requirements.
- Research widget implementation requirements.
- Identify notification and OTA limitations.
- Document technical decisions.
- Prepare the development plan.

Do not build the full application.

Acceptance criteria:
- Architecture is documented.
- Folder structure is proposed.
- Technical risks are documented.
- Important decisions are recorded.
- PROGRESS.md is updated.

Stop after Phase 0.

## PHASE 1 — APPLICATION FOUNDATION AND DESIGN SYSTEM

Read:
Sections 3, 4, 5, 14, and 16.

Goals:
- Initialize the Expo application.
- Configure TypeScript.
- Configure navigation.
- Establish the folder structure.
- Create reusable UI components.
- Implement the design system.
- Implement Dark, Light, and System themes.
- Set Dark as the default theme.
- Build main screen layouts and navigation shells.

Focus heavily on visual quality.

Acceptance criteria:
- Application runs.
- Navigation works.
- Theme selection works and persists.
- Dark and light themes are intentionally designed.
- Shared components are reusable.
- Main screen layouts look polished.
- Type checking passes.

Stop after Phase 1.

## PHASE 2 — BACKEND, DATABASE, AND AUTHENTICATION

Read:
Sections 3, 10, 15, and 16.

Goals:
- Implement the selected backend.
- Configure the database.
- Create database migrations.
- Implement authentication if included in the agreed architecture.
- Establish API communication.
- Implement authorization.
- Configure secure environment variables.
- Create `.env.example`.

Acceptance criteria:
- Database works.
- API communication works.
- Private user data is protected.
- Secrets are not exposed.
- Database migrations are reproducible.
- Tests pass.

Stop after Phase 2.

## PHASE 3 — TASK MANAGEMENT

Read:
Sections 5, 6, 11, and 16.

Goals:
- Task creation.
- Task editing.
- Task completion.
- Task deletion.
- Task history.
- Timed tasks.
- Untimed tasks.
- Reminder scheduling.
- End-of-day reminders.
- Task filtering.

Acceptance criteria:
- Task lifecycle works.
- Data persists.
- Reminder scheduling works where supported.
- Editing and completing tasks update reminders.
- Duplicate reminders are prevented.
- Tests pass.

Stop after Phase 3.

## PHASE 4 — MOOD TRACKING AND ANALYTICS

Read:
Sections 5, 7, 13, and 16.

Goals:
- Mood logging.
- Mood history.
- Mood editing and deletion.
- Day/week/month filtering.
- Mood trend chart.
- Mood distribution donut.
- Task completion progress ring.
- Task activity bar chart.
- Analytics summary cards.
- Empty states.

Focus heavily on chart quality and usability.

Acceptance criteria:
- Mood records persist.
- Analytics use actual data.
- Charts work in both themes.
- Date filtering works.
- Empty states are handled.
- Analytics calculations are tested.

Stop after Phase 4.

## PHASE 5 — AI PROVIDER SYSTEM

Read:
Sections 8, 9, 10, and 16.

Goals:
- Create provider abstraction.
- Implement the first selected provider.
- Implement provider configuration.
- Implement chat routing.
- Implement background routing.
- Implement failover.
- Handle rate limits and quotas.
- Secure API credentials.

Acceptance criteria:
- Provider system is modular.
- Chat uses the configured provider.
- Background failover works for retryable failures.
- Quota errors are handled clearly.
- API keys are secure.
- Tests pass.

Stop after Phase 5.

## PHASE 6 — AI CHAT AND PERSISTENT CONTEXT

Read:
Sections 8, 9, 10, and 16.

Goals:
- Build AI chat interface.
- Persist conversations.
- Persist messages.
- Build context construction.
- Integrate tasks and mood data into relevant AI context.
- Implement opening greetings.
- Implement conversation history.
- Handle failed messages and retries.

Acceptance criteria:
- Conversations persist.
- Context comes from application data.
- Changing providers does not lose user context.
- Failed messages can be retried.
- AI interpretations remain separate from user-authored data.

Stop after Phase 6.

## PHASE 7 — CHECK-INS AND BACKGROUND AI

Read:
Sections 8, 9, 10, 11, and 16.

Goals:
- Morning check-ins.
- Evening check-ins.
- Notification-to-conversation navigation.
- Daily summaries.
- Mood analysis.
- Task insights.
- Accomplishment appreciation.
- Background AI failover.
- Scheduled jobs.

Acceptance criteria:
- Check-ins respect user settings.
- Correct conversations open from notifications.
- Background jobs do not create duplicates.
- Summaries use stored records.
- AI insights are labelled correctly.
- Tests pass.

Stop after Phase 7.

## PHASE 8 — HOME-SCREEN WIDGETS

Read:
Sections 1.4, 12, 14, 15, and 16.

Goals:
- Research native widget support.
- Implement task widget.
- Implement mood widget.
- Implement widget data sharing.
- Implement quote rotation.
- Prevent recent quote repetition.
- Document platform limitations.

Acceptance criteria:
- Widgets work on the platform(s) claimed as supported.
- Task and mood actions work where supported.
- Data sharing is secure.
- Native build requirements are documented.

Stop after Phase 8.

## PHASE 9 — SETTINGS, PRIVACY, AND NOTIFICATIONS

Read:
Sections 10, 11, 14, and 16.

Goals:
- Complete theme settings.
- Complete individual notification toggles.
- Complete AI provider settings.
- Implement privacy explanations.
- Implement data controls.
- Implement export and deletion where included.

Acceptance criteria:
- Settings persist.
- Notification categories are independently configurable.
- Privacy information matches actual implementation.
- Data controls work securely.

Stop after Phase 9.

## PHASE 10 — INTEGRATION, OTA, AND RELEASE PREPARATION

Read:
Sections 1, 3, 15, 16, and 17.

Goals:
- Test complete application flows.
- Fix integration issues.
- Verify dark and light modes.
- Improve performance.
- Check accessibility.
- Configure EAS Build.
- Configure EAS Update.
- Verify update channels and runtime compatibility.
- Document build and release instructions.
- Prepare README.

Acceptance criteria:
- Main application flows work end-to-end.
- Tests pass.
- Type checking passes.
- Linting passes.
- OTA limitations are documented.
- Native build instructions are documented.
- Project setup instructions are complete.

Stop after Phase 10.

---

# 18. DEFINITION OF DONE

A feature is not complete just because its UI exists.

It is complete when:

- The user can perform the intended action.
- Data is correctly validated.
- Data persists where required.
- Loading states work.
- Empty states work.
- Error states work.
- Both themes are supported.
- Accessibility is considered.
- Relevant tests pass.
- No secrets are exposed.
- Documentation is updated.
- Limitations are documented honestly.

At the end of every phase:

1. Summarize completed work.
2. List files created or modified.
3. Report tests and results.
4. Report known issues.
5. Update PROGRESS.md.
6. Update DECISIONS.md.
7. Stop and wait for the next phase prompt.

The user controls when the next phase begins.