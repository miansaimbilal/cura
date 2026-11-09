# Cura — Over-The-Air (OTA) Update Guide

This document defines the over-the-air (OTA) update architecture, boundaries, publishing procedures, and rollback strategies for the Cura mobile application, conforming to **SPEC Sections 1.4 and 15**.

---

## 1. OTA Update Architecture

Cura uses **Expo Application Services (EAS) Update** for delivering instant fixes, UI enhancements, and asset updates directly to installed applications without requiring app store resubmission or manual user downloads.

### 1.1 Runtime Versioning Strategy

Cura configures runtime versioning using the **`fingerprint` policy** in `mobile/app.json`:

```json
"runtimeVersion": {
  "policy": "fingerprint"
}
```

The fingerprint policy computes a deterministic hash of all native source files, native dependencies, app configuration (`app.json`), permissions, and native modules (`modules/widget-bridge`).
- When an EAS Update is published, it is tagged with the current project runtime fingerprint.
- Installed client binaries only download and execute updates whose `runtimeVersion` exactly matches their compiled native fingerprint.
- This guarantees that an update containing JavaScript expecting new native APIs can never crash an older installed binary.

---

## 2. OTA-able vs. Non-OTA-able Changes (SPEC §1.4 & §15)

The table below provides a strict, unambiguous boundary of what changes can be delivered over-the-air versus those requiring a full native binary build (`.apk`, `.aab`, or `.ipa`).

| Category | Change Description | Can Deploy via OTA? | Deployment Method |
| :--- | :--- | :---: | :--- |
| **JavaScript / TypeScript** | Bug fixes in repositories, services, or helpers | **YES** | `eas update` |
| **UI Components & Screens** | Modifications to layouts, screens, cards, modals | **YES** | `eas update` |
| **Styling & Themes** | Dark/Light theme token tweaks, CSS-in-JS style changes | **YES** | `eas update` |
| **Local Assets** | Images, static icons, or translation files in `assets/` | **YES** | `eas update` |
| **Business Logic** | Analytics calculations, date utility adjustments | **YES** | `eas update` |
| **AI Prompting** | Bounded context formatting, fallback prompt templates | **YES** | `eas update` |
| **Native Modules** | Adding or altering Kotlin / Swift code in `widget-bridge` | **NO** | Native build (`eas build`) |
| **Home-Screen Widgets** | Modifying Android `RemoteViews`, `AppWidgetProvider`, or iOS WidgetKit Swift | **NO** | Native build (`eas build`) |
| **App Permissions** | Adding `POST_NOTIFICATIONS`, storage permissions, etc. | **NO** | Native build (`eas build`) |
| **Deep Link Schemes** | Adding new schemes or host intent filters in `app.json` | **NO** | Native build (`eas build`) |
| **Native Plugins** | Adding new Expo config plugins (`expo-sqlite`, `expo-notifications`) | **NO** | Native build (`eas build`) |
| **Expo SDK Version** | Upgrading Expo SDK or React Native core | **NO** | Native build (`eas build`) |
| **App Group Identifiers**| Changing `group.com.cura.app` or iOS entitlements | **NO** | Native build (`eas build`) |
| **Backend API / DB** | PostgreSQL migrations, Node.js server routes | **NO (Separate)** | Backend CI/CD deployment |

> [!IMPORTANT]
> Any change to files in `modules/widget-bridge/`, `android/`, `ios/`, or native properties in `app.json` automatically changes the `fingerprint` runtimeVersion. If you publish an OTA update after altering native code, clients with the previous binary will safely ignore the update until they download a newly compiled binary.

---

## 3. Update Channels and Environments

Cura defines three distinct release channels in `eas.json`:

| Channel | EAS Profile | Intended Audience | Purpose |
| :--- | :--- | :--- | :--- |
| `development` | `development` | Core developers | Live debug iteration with Expo Dev Client |
| `preview` | `preview` | Internal QA & beta testers | Standalone APK / TestFlight builds verifying pre-release candidates |
| `production` | `production` | End users | Google Play Store and Apple App Store production releases |

---

## 4. How to Publish an OTA Update

### 4.1 Prerequisites
1. Ensure your local git working directory is clean.
2. Verify all tests pass: `npm test --prefix mobile`
3. Verify typechecking: `npm run typecheck --prefix mobile`
4. Verify linting: `npm run lint --prefix mobile`

### 4.2 Publishing to Preview (QA)
```bash
cd mobile
eas update --channel preview --message "Fix: Improve mood chart label contrast in light theme"
```

### 4.3 Publishing to Production
```bash
cd mobile
eas update --channel production --message "Release: 1.0.1 hotfix for task completion sorting"
```

---

## 5. How to Roll Back an OTA Update

If a critical defect is discovered in a published OTA update:

### Method 1: Re-publish a Prior Known-Good Update Group
1. List recent updates to find the ID of the last known-good update group:
   ```bash
   eas update:list --channel production
   ```
2. Re-publish the prior good update group to the production channel:
   ```bash
   eas update:re-publish --group <LAST_GOOD_UPDATE_GROUP_ID> --channel production
   ```
3. Connected client devices will fetch the reverted bundle on their next app launch or background check.

### Method 2: Emergency Git Rollback & Hotfix Push
1. Revert the problematic commit in git:
   ```bash
   git revert HEAD
   npm test --prefix mobile
   npm run typecheck --prefix mobile
   ```
2. Publish the revert immediately:
   ```bash
   eas update --channel production --message "Emergency Rollback: Revert problematic changes"
   ```

---

## 6. Runtime Compatibility & Verification Checklist

Before publishing an OTA update, verify:
- [ ] No native files in `modules/widget-bridge/android/` or `modules/widget-bridge/ios/` were touched.
- [ ] No changes were made to native keys in `mobile/app.json` (`android.package`, `ios.bundleIdentifier`, `plugins`, `intentFilters`, `permissions`, `appGroups`).
- [ ] `npx expo config --type public` outputs the expected `com.cura.app` bundle/package identifiers and unchanged `runtimeVersion`.
- [ ] The update does not expect newly migrated SQLite columns that older client databases lack without defensive fallbacks.
