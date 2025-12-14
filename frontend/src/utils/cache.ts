interface CacheEntry<T> {
  data: T;
  timestamp: number;
  createdAt: number; // When cache was created (for age checking)
}

class Cache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL: number = 3600000; // 60 minutes (increased to reduce RPC calls and improve performance)
  private localStoragePrefix = 'pusd_cache_'; // Prefix for localStorage keys

  // Use localStorage for shared cache across tabs/users (for public data like stats)
  private useLocalStorage(key: string): boolean {
    // Use localStorage for public/shared data (like lottery stats)
    return key.startsWith('lottery-') || key.startsWith('tvl-') || key.startsWith('project-');
  }

  set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now() + ttl,
      createdAt: Date.now(),
    };
    
    // Store in memory
    this.cache.set(key, entry);
    
    // Also store in localStorage for shared cache across tabs/users (for public data)
    if (this.useLocalStorage(key)) {
      try {
        const storageKey = this.localStoragePrefix + key;
        localStorage.setItem(storageKey, JSON.stringify(entry));
      } catch (e) {
        // localStorage might be full or disabled, ignore
      }
    }
  }

  get<T>(key: string): T | null {
    // Check memory cache first
    const memoryEntry = this.cache.get(key);
    if (memoryEntry) {
      if (Date.now() > memoryEntry.timestamp) {
        this.cache.delete(key);
      } else {
        return memoryEntry.data as T;
      }
    }
    
    // Check localStorage for shared cache (for public data)
    if (this.useLocalStorage(key)) {
      try {
        const storageKey = this.localStoragePrefix + key;
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const entry: CacheEntry<T> = JSON.parse(stored);
          if (Date.now() <= entry.timestamp) {
            // Also update memory cache
            this.cache.set(key, entry);
            return entry.data as T;
          } else {
            // Expired, remove from localStorage
            localStorage.removeItem(storageKey);
          }
        }
      } catch (e) {
        // localStorage might be disabled or corrupted, ignore
      }
    }
    
    return null;
  }

  getTimestamp(key: string): number | null {
    const entry = this.cache.get(key);
    if (entry) return entry.createdAt;
    
    // Check localStorage
    if (this.useLocalStorage(key)) {
      try {
        const storageKey = this.localStoragePrefix + key;
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const entry: CacheEntry<any> = JSON.parse(stored);
          return entry.createdAt;
        }
      } catch (e) {
        // Ignore
      }
    }
    
    return null;
  }

  getAge(key: string): number | null {
    const timestamp = this.getTimestamp(key);
    if (timestamp === null) return null;
    return Date.now() - timestamp;
  }

  clear(): void {
    this.cache.clear();
    // Clear localStorage cache
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.localStoragePrefix)) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      // Ignore
    }
  }

  delete(key: string): void {
    this.cache.delete(key);
    // Also delete from localStorage
    if (this.useLocalStorage(key)) {
      try {
        const storageKey = this.localStoragePrefix + key;
        localStorage.removeItem(storageKey);
      } catch (e) {
        // Ignore
      }
    }
  }
}

export const cache = new Cache();

