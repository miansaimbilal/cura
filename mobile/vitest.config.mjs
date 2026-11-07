import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      'expo-notifications': path.resolve(__dirname, 'tests/helpers/notificationsMock.ts'),
      '@react-native-async-storage/async-storage': path.resolve(__dirname, 'tests/helpers/asyncStorageMock.ts'),
      'react-native': path.resolve(__dirname, 'tests/helpers/reactNativeMock.ts'),
      'expo-sqlite': path.resolve(__dirname, 'tests/helpers/expoSqliteMock.ts'),
    },
  },
  define: {
    __DEV__: true,
  },
});
