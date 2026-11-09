export interface PublishSnapshotOptions {
  candidateFile?: string;
  userId: string;
  epoch: number;
  revision: number;
  contentJson: string;
}

export interface WidgetManifest {
  activeFile: string;
  accountEpoch: number;
  revision: number;
  userId: string;
  updatedAt: string;
}

interface ExpoWidgetBridgeNative {
  publishSnapshot(options: PublishSnapshotOptions): Promise<boolean>;
  readCurrentManifest(): Promise<WidgetManifest | null>;
  clearSnapshots?(): Promise<boolean>;
}

let nativeModule: ExpoWidgetBridgeNative | null = null;
let resolved = false;

function getNativeModule(): ExpoWidgetBridgeNative | null {
  if (resolved) {
    return nativeModule;
  }
  try {
    // Dynamically require to avoid breaking Node.js test environments
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expoCore = require('expo-modules-core');
    if (expoCore && typeof expoCore.requireNativeModule === 'function') {
      nativeModule = expoCore.requireNativeModule('ExpoWidgetBridge');
    }
  } catch {
    nativeModule = null;
  } finally {
    resolved = true;
  }
  return nativeModule;
}

/**
 * Publishes a widget snapshot payload atomically through the native bridge.
 * If running on a non-native or unsupported platform, falls back to a safe no-op.
 */
export async function publishSnapshot(
  options: PublishSnapshotOptions
): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod?.publishSnapshot) {
    return true; // Fallback for environments where native module is not linked
  }
  return await mod.publishSnapshot(options);
}

/**
 * Reads the current pointer manifest current.json from the snapshots directory.
 */
export async function readCurrentManifest(): Promise<WidgetManifest | null> {
  const mod = getNativeModule();
  if (!mod?.readCurrentManifest) {
    return null;
  }
  return await mod.readCurrentManifest();
}

/**
 * Clears existing snapshots from the snapshots directory.
 */
export async function clearSnapshots(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod?.clearSnapshots) {
    return true;
  }
  return await mod.clearSnapshots();
}

export default {
  publishSnapshot,
  readCurrentManifest,
  clearSnapshots,
};
