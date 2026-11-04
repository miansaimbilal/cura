# EAS Update & Build Strategy

## 1. Role of EAS Update in Cura

EAS Update delivers over-the-air (OTA) updates to installed mobile applications without waiting for Google Play Store or Apple App Store app review. It is intended for:
- Urgent bug fixes in business logic.
- UI styling, theme adjustments, and layout refinements.
- Client-side data transformation and chart adjustments.
- Static bundled asset updates (icons, fonts, images).

---

## 2. Strict OTA Boundaries: What Can and Cannot Be Pushed

| Category | Delivered via EAS Update (OTA) | Requires Native Rebuild (`eas build`) |
| :--- | :---: | :---: |
| **React Components & UI Styling** | YES | NO |
| **Theme tokens (Colors, Typography, Spacing)** | YES | NO |
| **Business Logic, Hooks, Validation** | YES | NO |
| **New Native Packages (e.g. adding `expo-camera`)** | NO | YES |
| **Native Permissions (`SCHEDULE_EXACT_ALARM`)** | NO | YES |
| **Widget Code (SwiftUI extensions, Kotlin receivers)**| NO | YES |
| **App Groups / Native Capabilities** | NO | YES |
| **Expo SDK Upgrades** | NO | YES |
| **`app.json` Native Config Plugins** | NO | YES |

---

## 3. Runtime Version Compatibility Strategy

To prevent shipping JavaScript bundles to native app binaries that lack required native code (which causes immediate crashes), Cura adopts the **`fingerprint` runtime version policy**:

```json
{
  "expo": {
    "runtimeVersion": {
      "policy": "fingerprint"
    },
    "updates": {
      "url": "https://u.expo.dev/[PROJECT-ID]"
    }
  }
}
```

### Why `fingerprint` is preferred:
- Expo automatically generates a hash based on the exact native code, native modules, configuration plugins, and SDK versions.
- If JS changes without touching native dependencies, the fingerprint remains identical $\rightarrow$ OTA update deploys smoothly.
- If native code or plugins are altered (e.g., in Phase 8 for widgets or Phase 3 for exact alarms), the fingerprint changes $\rightarrow$ Older client binaries will safely ignore the incompatible update until users update through their app store.

---

## 4. Channels and Environments

- **`development`**: Local development client builds for debugging native modules and widgets.
- **`preview`**: Internal staging builds distributed via EAS internal distribution or TestFlight/Play Internal Sharing. Linked to staging backend.
- **`production`**: App Store and Play Store releases. Linked to production backend and production EAS update channel.
