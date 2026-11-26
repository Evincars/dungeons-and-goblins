import { attemptAsync, StateError } from '../../core/errors';
import type { Result } from '../../core/errors';

/**
 * Where the player's own preferences are kept between games (the quick bar's presets and size, game/QuickBarProfile.ts):
 * documents of plain JSON, each under a name of its own. Reading and writing are asynchronous, so a store kept on a
 * server (Firebase, later) fits the same calls as the browser's own. To keep them elsewhere, write e.g.
 * `class FirebaseProfileStore extends ProfileStore { … }` and call `useProfileStore(new FirebaseProfileStore())` at start-up
 * — no other code changes.
 */
export abstract class ProfileStore {
  /** The document kept under this name, as stored (undefined when there is none); the caller checks what it holds. */
  abstract read(doc: string): Promise<Result<unknown>>;
  /** Keeps this document under this name, in place of what was there. */
  abstract write(doc: string, value: unknown): Promise<Result<void>>;
}

const KEY_PREFIX = 'dungeons-and-goblins-profile:';

/**
 * The browser's localStorage, beside the saved games (game/SaveStore.ts): the documents are a few kilobytes of JSON read
 * once at start-up, which it serves at once, with no database to open.
 */
export class LocalProfileStore extends ProfileStore {
  read(doc: string): Promise<Result<unknown>> {
    return attemptAsync(async () => {
      const raw = this.storage().getItem(KEY_PREFIX + doc);
      const value: unknown = raw === null ? undefined : JSON.parse(raw);
      return value;
    }, 'load-failed');
  }

  write(doc: string, value: unknown): Promise<Result<void>> {
    return attemptAsync(async () => {
      this.storage().setItem(KEY_PREFIX + doc, JSON.stringify(value));
    }, 'load-failed');
  }

  private storage(): Storage {
    if (typeof localStorage === 'undefined') throw new StateError('This browser keeps no preferences');
    return localStorage;
  }
}

/** A store that keeps documents only while the game runs (tests, or a browser that keeps nothing). */
export class MemoryProfileStore extends ProfileStore {
  private readonly docs = new Map<string, string>();

  read(doc: string): Promise<Result<unknown>> {
    return attemptAsync(async () => {
      const raw = this.docs.get(doc);
      const value: unknown = raw === undefined ? undefined : JSON.parse(raw);
      return value;
    });
  }

  write(doc: string, value: unknown): Promise<Result<void>> {
    return attemptAsync(async () => {
      this.docs.set(doc, JSON.stringify(value));
    });
  }
}

let current: ProfileStore = new LocalProfileStore();

/** Where the player's preferences are kept from now on. */
export function useProfileStore(store: ProfileStore): void {
  current = store;
}

export function profileStore(): ProfileStore {
  return current;
}
