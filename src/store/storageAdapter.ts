/**
 * Abstracted Zustand StateStorage Adapter
 * Supports AsyncStorage (default), MMKV (native fast), and InMemory (tests)
 * Includes SafeJSONStorage for automatic corruption recovery.
 */

import { StateStorage, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * In-Memory Storage Adapter for isolated, synchronous Jest testing.
 */
export class InMemoryStorage implements StateStorage {
  private memory = new Map<string, string>();

  getItem(name: string): string | null {
    return this.memory.get(name) ?? null;
  }

  setItem(name: string, value: string): void {
    this.memory.set(name, value);
  }

  removeItem(name: string): void {
    this.memory.delete(name);
  }

  clear(): void {
    this.memory.clear();
  }

  getAllKeys(): string[] {
    return Array.from(this.memory.keys());
  }
}

/**
 * Default AsyncStorage Adapter.
 */
export class AsyncStorageAdapter implements StateStorage {
  async getItem(name: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(name);
    } catch (error) {
      console.warn(`[AsyncStorageAdapter] Error reading key "${name}":`, error);
      return null;
    }
  }

  async setItem(name: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (error) {
      console.warn(`[AsyncStorageAdapter] Error writing key "${name}":`, error);
    }
  }

  async removeItem(name: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(name);
    } catch (error) {
      console.warn(`[AsyncStorageAdapter] Error removing key "${name}":`, error);
    }
  }
}

/**
 * Optional MMKV Storage Adapter (activated if react-native-mmkv is installed and in native environment).
 */
export class MMKVAdapter implements StateStorage {
  private mmkvInstance: any = null;

  constructor() {
    try {
      // Dynamic require so non-native / test environments don't crash
      const mmkvModule = require('react-native-mmkv');
      const MMKVConstructor = mmkvModule.MMKV;
      if (MMKVConstructor) {
        this.mmkvInstance = new MMKVConstructor({ id: 'lazy-scheduler-storage' });
      }
    } catch {
      this.mmkvInstance = null;
    }
  }

  isAvailable(): boolean {
    return this.mmkvInstance !== null;
  }

  getItem(name: string): string | null {
    if (!this.mmkvInstance) return null;
    return this.mmkvInstance.getString(name) ?? null;
  }

  setItem(name: string, value: string): void {
    if (!this.mmkvInstance) return;
    this.mmkvInstance.set(name, value);
  }

  removeItem(name: string): void {
    if (!this.mmkvInstance) return;
    this.mmkvInstance.delete(name);
  }
}

/**
 * Singleton Instances
 */
export const inMemoryStorage = new InMemoryStorage();
export const asyncStorageAdapter = new AsyncStorageAdapter();
export const mmkvAdapter = new MMKVAdapter();

// Active storage reference (can be overridden in tests or dynamically selected)
let activeStorage: StateStorage = asyncStorageAdapter;

function isRunningInTest(): boolean {
  return (
    typeof process !== 'undefined' &&
    (process.env?.NODE_ENV === 'test' || process.env?.JEST_WORKER_ID !== undefined)
  );
}

// In test environment, default to asyncStorageAdapter so AsyncStorage mocks in Jest are utilized,
// or inMemoryStorage if requested.
if (isRunningInTest()) {
  activeStorage = asyncStorageAdapter;
} else if (mmkvAdapter.isAvailable()) {
  activeStorage = mmkvAdapter;
} else {
  activeStorage = asyncStorageAdapter;
}

/**
 * Get current storage adapter.
 */
export function getStorageAdapter(): StateStorage {
  return activeStorage;
}

/**
 * Override storage adapter (for test isolation or runtime preference).
 */
export function setStorageAdapter(adapter: StateStorage): void {
  activeStorage = adapter;
}

/**
 * Safe JSON Storage: Intercepts raw string to safely handle JSON parsing.
 * If data is corrupted (SyntaxError), returns null so Zustand loads initial defaults.
 */
export class SafeJSONStorage implements StateStorage {
  constructor(private rawStorage: StateStorage) {}

  async getItem(name: string): Promise<string | null> {
    try {
      const raw = await this.rawStorage.getItem(name);
      if (!raw) return null;
      // Probe parse to detect corrupted data
      const parsed = JSON.parse(raw);
      // Extra sanity check: if Zustand state is not an object, treat as corrupt
      if (parsed && typeof parsed === 'object') {
        if ('state' in parsed && (typeof parsed.state !== 'object' || parsed.state === null)) {
          throw new SyntaxError('Corrupted JSON: Zustand state is not a valid object');
        }
      }
      return raw;
    } catch (error) {
      console.warn(
        `[SafeJSONStorage] Corrupted data detected on key "${name}". Falling back to default initial state.`,
        error
      );
      return null;
    }
  }

  setItem(name: string, value: string): unknown {
    return this.rawStorage.setItem(name, value);
  }

  removeItem(name: string): unknown {
    return this.rawStorage.removeItem(name);
  }
}

/**
 * Creates Zustand JSON storage with SafeJSONStorage protection.
 */
export function createAppJSONStorage() {
  return createJSONStorage(() => new SafeJSONStorage(getStorageAdapter()));
}
