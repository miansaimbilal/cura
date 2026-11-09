# Cura — Native Build and Release Guide

This document outlines the end-to-end instructions for building, signing, and releasing native binaries for Android and iOS using Expo Application Services (EAS) and local tooling, conforming to **SPEC Sections 1.4, 3, 15, and 17**.

---

## 1. Build Architecture & EAS Configuration

Cura defines standard EAS Build profiles in `mobile/eas.json`:

```json
{
  "cli": {
    "version": ">= 14.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development",
      "android": { "buildType": "apk" },
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "android": { "buildType": "apk" }
    },
    "production": {
      "channel": "production",
      "autoIncrement": true,
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": {
    "production": {}
  }
}
```

### Profile Summary
- **development**: Generates an Expo Dev Client build with native modules (`widget-bridge`, `expo-sqlite`, `expo-notifications`) linked for active development.
- **preview**: Compiles a standalone `.apk` for direct sideloading and manual QA on Android devices (e.g. Samsung SM-A528B) without requiring Google Play Store provisioning.
- **production**: Generates an optimized Android App Bundle (`.aab`) for Google Play Store submission and an iOS archive (`.ipa`) for App Store Connect / TestFlight.

---

## 2. Environment Variables & Secret Safety (SPEC §1.3 & §3.4)

> [!CAUTION]
> Never commit `.env` files, production API keys, database credentials, or signing keystores to version control.

### Client-Side Environment Variables
Cura is offline-first. The mobile application accesses the backend API via `EXPO_PUBLIC_API_URL`. Configure in `mobile/.env.local`:
```bash
EXPO_PUBLIC_API_URL=https://api.cura.app
```
*(For local testing on Android physical device: use your machine's LAN IP, e.g., `http://192.168.1.100:3000`)*

### Backend Secrets
Managed exclusively in `backend/.env` on the host server:
- `DATABASE_URL`: PostgreSQL connection string with SSL in production.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: Cryptographically strong random strings (256-bit+).
- `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`: API provider keys.

---

## 3. Android Build Instructions (Windows / Linux / macOS)

### 3.1 Local Clean Prebuild Verification
To verify native Android project generation without compiling:
```bash
cd mobile
npx expo prebuild --clean --platform android --no-install
```
Expected output:
- Generates native files in `mobile/android/` with package `com.cura.app`.
- Links native widget bridge module from `mobile/modules/widget-bridge/android`.
- Configures intent filters for `cura://widget-action`, `cura://tasks`, and `cura://mood`.

### 3.2 Building Android Preview APK via EAS
To generate a standalone `.apk` for installation on test devices:
```bash
cd mobile
eas build --profile preview --platform android
```
Once the build completes on EAS cloud:
1. Download the `.apk` file from the EAS build URL.
2. Transfer to test device (e.g., Samsung SM-A528B) via USB or download directly.
3. Install and verify:
   - App launches into Guest mode with local SQLite.
   - Long-press home screen -> Widgets -> Cura Tasks & Cura Mood widgets are present.
   - Adding widget renders initial tasks and mood status.

### 3.3 Building Android Production App Bundle (`.aab`)
```bash
cd mobile
eas build --profile production --platform android
```
The resulting `.aab` is ready for upload to Google Play Console.

---

## 4. iOS Build Instructions (macOS Required)

> [!NOTE]
> iOS native builds and Xcode WidgetKit extension integration require macOS with Xcode 16+ installed. Do not attempt to run iOS native builds directly on Windows.

### 4.1 Prerequisites (macOS)
- macOS Sequoia or newer with Xcode 16+
- Apple Developer Program account with App Group entitlement: `group.com.cura.app`
- CocoaPods (`brew install cocoapods` or Bundler)

### 4.2 Local Prebuild & Xcode Setup
1. Generate native iOS project:
   ```bash
   cd mobile
   npx expo prebuild --clean --platform ios
   ```
2. Open `mobile/ios/Cura.xcworkspace` in Xcode.
3. Verify App Groups Capability:
   - In the `Cura` target -> **Signing & Capabilities** tab.
   - Ensure **App Groups** is present and `group.com.cura.app` is checked.
4. **Widget Extension Setup (Phase 8 Invariant):**
   - In Xcode: File -> New -> Target -> **Widget Extension**.
   - Product Name: `CuraWidgetsExtension`.
   - Embed in Application: `Cura`.
   - Copy Swift source files from `mobile/modules/widget-bridge/ios/` into the widget extension target.
   - In the `CuraWidgetsExtension` target -> **Signing & Capabilities** -> Add **App Groups** capability -> select `group.com.cura.app`.

### 4.3 Building iOS via EAS
To build for internal TestFlight testing via EAS:
```bash
cd mobile
eas build --profile production --platform ios
```
EAS will automatically manage iOS distribution provisioning profiles and App Group signing entitlements.

---

## 5. Pre-Release Quality Checklist

Before submitting a production release to Google Play or App Store:

- [ ] **Automated Tests**:
  - `npm test --prefix mobile` (all 227+ tests passing; only 2 known baseline dailySummary date mocks failing).
  - `npm test --prefix backend` (all backend integration tests passing).
- [ ] **Type Safety**:
  - `npm run typecheck --prefix mobile` (0 errors).
  - `npm run typecheck --prefix backend` (0 errors).
- [ ] **Linting**:
  - `npm run lint --prefix mobile` (0 errors, 0 warnings).
  - `npm run lint --prefix backend` (0 errors, 0 warnings).
- [ ] **Diagnostics**:
  - `npx expo config --type public` reports valid bundle ID `com.cura.app` and fingerprint runtimeVersion.
- [ ] **Privacy Disclosures**:
  - Privacy policy URL in App Store / Play Console points to active privacy notice.
  - Sensitive data controls verified: "Delete My Data" wipes local SQLite completely.
  - Pakistan crisis numbers (Rescue 1122, Police 15, Edhi 115, Umang, Rozan) verified reachable.
- [ ] **Security**:
  - No `.env` or production credentials in git history.
  - JWT expiry limits and token refresh logic functioning as designed.
