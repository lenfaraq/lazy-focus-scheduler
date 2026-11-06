// jest.setup.js
// Set up global mocks for Jest in Expo / React Native environment

// 1. Mock AsyncStorage using official in-memory mock
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// 2. Silence expected console warnings during intentional corruption tests
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('[storageAdapter]') ||
       args[0].includes('Corrupted JSON') ||
       args[0].includes('SafeJSONStorage') ||
       args[0].includes('[scheduleStore]') ||
       args[0].includes('Invalid day schedule') ||
       args[0].includes('[AsyncStorageAdapter]') ||
       args[0].includes('Cannot delete the last remaining') ||
       args[0].includes('Update rejected due to validation errors'))
    ) {
      return;
    }
    originalWarn(...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
});
