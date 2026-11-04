# Home-Screen Widgets & Notification Research

## 1. Home-Screen Widgets Architecture

### 1.1 Technical Constraints & Operating System Realities
- **No Shared JavaScript Runtime:** Widgets on both iOS and Android execute in isolated native processes. They cannot run the full React Native application bundle, execute React hooks, or access in-memory app state.
- **Expo Go Incompatible:** Because widgets require native extension targets, App Groups, and custom manifest/intent entries, widgets cannot be tested in Expo Go. They require **Development Builds** (`npx expo run:android`, `npx expo run:ios`, or `eas build --profile development`).
- **Continuous Native Generation (CNG):** Using Expo Config Plugins allows the project to maintain native widget source files (SwiftUI and JSX/Kotlin) inside the repository while retaining a managed workflow without manually maintaining `ios/` and `android/` folders in git.

---

### 1.2 Android Implementation Comparison & Final Recommendation

We compared the two leading architectural routes for Android home-screen widgets in an Expo environment:

| Factor | Option A: Native Kotlin AppWidget (`AppWidgetProvider` + Jetpack Compose) | Option B: `react-native-android-widget` (Recommended) |
| :--- | :--- | :--- |
| **Language & Syntax** | Kotlin, XML layouts, or Jetpack Compose Glance. | TypeScript & JSX using RemoteViews primitives (`<FlexWidget>`, `<TextWidget>`). |
| **Expo Config Plugin** | Custom config plugin required to copy `.kt` files, XML metadata, and patch `AndroidManifest.xml` during prebuild. | Built-in official Expo config plugin provided and actively maintained by package. |
| **Interactivity** | Native `PendingIntent` and `BroadcastReceiver` handlers in Kotlin. | JavaScript widget task handlers (`registerWidgetTaskHandler`) running in headless JS thread. |
| **Maintenance Burden** | **High:** Custom config plugins frequently break when Expo upgrades Android Gradle templates or directory structures. | **Low:** Maintained as a standard npm dependency with declarative `app.json` properties. |
| **Data Sharing** | Requires custom native module or raw SQLite file access from Kotlin. | Interacts directly with local storage (`expo-sqlite` / AsyncStorage) from the background task handler. |
| **Official Docs** | [Android AppWidget Overview](https://developer.android.com/develop/ui/views/appwidgets/overview) | [react-native-android-widget GitHub](https://github.com/sAleksovski/react-native-android-widget) |

#### Final Android Recommendation: `react-native-android-widget`
**Recommendation:** Use **`react-native-android-widget`** as the primary Android widget technology.
- **Why:** It satisfies 100% of Cura's functional requirements (displaying today's tasks, marking a task complete with a tap, tapping a mood icon to log current feeling, and displaying a 5-hour rotating quote) while keeping all layout and interaction code in TypeScript. It eliminates the fragility of maintaining custom Kotlin string-replacement config plugins across Expo SDK upgrades.
- **Android Limitations:**
  - Layouts are strictly constrained to Android `RemoteViews` capabilities (no arbitrary CSS flexbox, complex animations, or SVG vector path manipulation).
  - Background widget tasks run in a headless JS instance and must read state from local SQLite/storage; they cannot access live React component state.

---

### 1.3 iOS Implementation Confirmation (WidgetKit & SwiftUI)
1. **Target:** Native iOS App Extension built with Swift and SwiftUI using WidgetKit.
2. **Scaffolding:** Managed via **`@bacons/apple-targets`** ([Docs](https://github.com/EvanBacon/apple-targets)), which automates Xcode target generation, compilation settings, and extension provisioning during `npx expo prebuild`.
3. **Data Sharing via App Groups:**
   - Configure an App Group capability (`group.com.cura.app`) via config plugin.
   - The React Native app writes task lists, latest mood, and quotes to a shared JSON container or `UserDefaults(suiteName: "group.com.cura.app")`.
   - The Swift widget reads this shared container synchronously during timeline generation.
4. **Interactivity (iOS 17+):**
   - iOS 17 introduced interactive widgets using `AppIntent`. Users can tap an intent button to mark a task done or select a mood.
   - Complex interactions (like typing a reflection or editing task descriptions) are prohibited by Apple; tapping these triggers a deep link directly into the app (`cura://tasks/edit/:id` or `cura://mood/log`).
5. **Timeline Budgeting:**
   - iOS imposes a budget of approximately 40 to 70 timeline reloads per 24-hour cycle.
   - The app explicitly requests a reload via `WidgetCenter.shared.reloadAllTimelines()` only when the user completes/creates tasks or logs a mood.
   - The 5-hour quote rotation is pre-scheduled statically across future timeline entries in the `TimelineProvider`.

---

## 2. Notification Architecture & OS Restrictions

### 2.1 Notification Categories & Delivery Mechanism
Per SPEC Section 11, Cura requires individual toggles for six categories:
1. **Timed Task Reminders:** Scheduled local notification triggered at exact task due date/time.
2. **End-of-Day Task Reminders:** Scheduled local notification at a configurable evening time (e.g., 21:00) listing incomplete untimed tasks.
3. **Morning AI Check-in:** Scheduled local or push notification inviting user to reflect and plan.
4. **Evening AI Check-in:** Scheduled local or push notification prompting evening reflection.
5. **Accomplishment Notifications:** Event-driven notification triggered upon completing milestones or tasks.
6. **AI Insight Notifications:** Push notification when background AI identifies a meaningful trend.

### 2.2 Local vs Remote Push Notifications
- **Local Notifications (`expo-notifications`):**
  - Used for Timed Tasks, EOD Reminders, and Daily Check-ins.
  - Advantages: Reliable even when offline; instant scheduling; no push server latency.
- **Remote Push Notifications (Expo Push API / FCM / APNs):**
  - Used for AI Insights and Background Summaries generated on the backend.
  - Server verifies user category preferences before dispatching.

### 2.3 Android 13 & 14 Restrictions
- **Android 13 (API 33) Runtime Permission:** Requires explicit `POST_NOTIFICATIONS` runtime permission dialog.
- **Android 14 (API 34) Exact Alarms (`SCHEDULE_EXACT_ALARM`):**
  - Android 14 revokes exact alarm permission by default for new installs.
  - Timed task reminders require either:
    1. Declaring `android.permission.SCHEDULE_EXACT_ALARM` in `app.json` and requesting user grant via System Settings if revoked, or
    2. Gracefully degrading to inexact windowed alarms (`SchedulableTriggerInputTypes.DATE`) with high importance channels.
  - Reference: [Android 14 Exact Alarm Behavior](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms)
- **OEM Battery Optimizations & Doze Mode:**
  - Manufacturers (Samsung, Xiaomi, Huawei) aggressively freeze background processes.
  - Setup high-importance Android Notification Channels (`importance: MAX`, `sound: true`, `vibrationPattern`).
- **Device Reboot Resilience:**
  - Operating system cleans scheduled alarms on device reboot.
  - Cura runs an app-boot synchronization service that re-queries pending tasks from local SQLite and re-registers upcoming notifications with `expo-notifications`.
