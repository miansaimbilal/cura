# Expo SDK 58 Dependency & Package Compatibility Matrix (Finalized November 2026)

This document establishes the verified dependency versions and package installation rules for **Expo SDK 58**.

---

## 1. Core Platform Baseline (Expo SDK 58)

| Component | Target Version | Status | Official Documentation Link |
| :--- | :--- | :--- | :--- |
| **Expo SDK** | `~58.0.0` | Production Stable (October 2026) | [Expo SDK 58 Release Notes](https://docs.expo.dev/versions/latest/) |
| **React Native** | `0.88.x` | Shipped with SDK 58 | [React Native Releases](https://reactnative.dev/blog) |
| **React** | `19.2.x` | React 19 LTS baseline | [React 19 Documentation](https://react.dev/) |
| **Minimum Node.js** | `>= 22.13.x` (Node 22 / 24 LTS) | Verified (Local is `v24.20.0`, satisfying requirement) | [Node.js Releases](https://nodejs.org/) |
| **Architecture** | **New Architecture Mandatory** (TurboModules & Fabric) | Default in SDK 58 (Legacy bridge removed in SDK 55; `newArchEnabled` removed from `app.json`) | [Expo New Architecture](https://docs.expo.dev/guides/new-architecture/) |

---

## 2. First-Party Expo SDK 58 Packages (Exact Version Mappings)

All first-party Expo libraries in SDK 58 align directly with the SDK 58 package manifest:

| Package | Recommended Version | Purpose & Official Docs |
| :--- | :---: | :--- |
| **`expo-router`** | `~58.0.30` | [Expo Router Docs](https://docs.expo.dev/router/introduction/) — Typed file-based routing versioned in lockstep with SDK 58; React 19 ready. |
| **`expo-sqlite`** | `~58.0.0` | [expo-sqlite Docs](https://docs.expo.dev/versions/latest/sdk/sqlite/) — Pure async Promise API (`openDatabaseSync`, `execAsync`), `<SQLiteProvider>`. |
| **`expo-secure-store`** | `~58.0.0` | [expo-secure-store Docs](https://docs.expo.dev/versions/latest/sdk/securestore/) — Hardware-backed encryption via iOS Keychain / Android KeyStore. |
| **`expo-notifications`** | `~58.0.0` | [expo-notifications Docs](https://docs.expo.dev/versions/latest/sdk/notifications/) — Local & remote notifications; Android 14+ exact alarm handling. |
| **`expo-updates`** | `~58.0.0` | [expo-updates Docs](https://docs.expo.dev/versions/latest/sdk/updates/) — EAS Update engine with `"runtimeVersion": { "policy": "fingerprint" }`. |
| **`expo-haptics`** | `~58.0.7` | [expo-haptics Docs](https://docs.expo.dev/versions/latest/sdk/haptics/) — Tactile feedback for task completion and mood selection. |
| **`@expo/vector-icons`** | `^15.0.2` | [Expo Vector Icons](https://docs.expo.dev/guides/icons/) — System icons (Lucide, Feather, MaterialCommunityIcons; installed `15.1.1`). |

---

## 3. Verified Third-Party Packages

Third-party dependencies must be verified for compatibility with React Native 0.88 and the New Architecture (TurboModules/Fabric):

| Package | Recommended Version | Compatibility Assessment |
| :--- | :---: | :--- |
| **`drizzle-orm`** | `^0.38.0` | Pure TypeScript query builder. Seamlessly interfaces with `expo-sqlite`'s modern driver; automated migrations via `drizzle-kit`. |
| **`@react-native-async-storage/async-storage`** | `2.2.0` | Pinned for SDK 58, fully migrated to TurboModules; used for non-sensitive local preferences (e.g. active theme). |
| **`react-native-svg`** | `~15.11.0` | Fabric-native rendering engine maintained by Software Mansion; 100% New Architecture compliant. |
| **`react-native-android-widget`** | `~0.14.0` | Stefan Aleksovski's library actively updated for React Native 0.88 & New Architecture; includes official Expo config plugin. |
| **`@bacons/apple-targets`** | `~0.0.65` | Maintained by Evan Bacon (Expo core team); Continuous Native Generation for iOS 17–20 WidgetKit targets. |

---

## 4. Package Installation Rule for Phase 1 and Beyond

To prevent version skew, dependency mismatches, or peer-dependency errors:
1. **Always install packages via `npx expo install`:**
   ```bash
   npx expo install expo-router expo-sqlite expo-secure-store expo-notifications expo-updates expo-haptics react-native-svg
   ```
2. **Align dependencies using the official SDK manifest:**
   ```bash
   npx expo install --fix
   ```
3. **Verify project health and configuration:**
   ```bash
   npx expo-doctor
   ```
Never install raw unverified patch versions using plain `npm install <package>` for Expo native modules.
