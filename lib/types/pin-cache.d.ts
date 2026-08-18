/**
 * Machine-local cache of user-pinned interpreter / install paths. The file
 * lives at `$DSH_HOME/envsel-pinned.json` and is shared across sessions; each
 * session still chooses independently from the resulting catalog entries.
 *
 * @module @deepseek-ai/dsh-envsel/pin-cache
 */
import type { Context } from '@deepseek-ai/cordis';
import type { EnvEntry } from './types.ts';
/** On-disk file name of the machine-local pin cache under the harness home. */
export declare const PINNED_FILE_NAME = "envsel-pinned.json";
/** One remembered host path. */
export interface PinnedPath {
    readonly path: string;
}
/**
 * Resolved pin-cache file under the current harness home.
 * @returns the absolute `$DSH_HOME/envsel-pinned.json` path.
 */
export declare function pinnedCachePath(): string;
/**
 * Parse the on-disk document into a de-duplicated path list.
 * @param raw - file contents; invalid JSON becomes an empty list.
 * @returns remembered paths in document order.
 */
export declare function parsePinnedDocument(raw: string): PinnedPath[];
/**
 * Serialize remembered paths as a stable JSON array.
 * @param pins - paths to persist.
 * @returns UTF-8 document with a trailing newline.
 */
export declare function serializePinnedDocument(pins: readonly PinnedPath[]): string;
/**
 * Read the pin file; a missing or unreadable file is an empty list.
 * @param ctx - host context carrying `fs`.
 * @returns remembered paths, or `[]` when the file is absent.
 */
export declare function readPinnedPaths(ctx: Context): Promise<PinnedPath[]>;
/**
 * Replace the pin file with the given list (empty list still writes).
 * @param ctx - host context carrying `fs`.
 * @param pins - complete replacement list.
 */
export declare function writePinnedPaths(ctx: Context, pins: readonly PinnedPath[]): Promise<void>;
/** Result of probing every remembered path into catalog entries. */
export interface ResolvedPins {
    readonly entries: EnvEntry[];
    readonly warnings: string[];
}
/**
 * Probe every remembered path. A vanished path stays on disk (the user can
 * unpin it) and becomes a catalog warning so the dropdown still explains it.
 * @param ctx - host context carrying `fs`.
 * @returns catalog entries plus one warning per unusable pin.
 */
export declare function resolvePinnedEntries(ctx: Context): Promise<ResolvedPins>;
/**
 * Append a path to the cache if it is not already present.
 * @param ctx - host context carrying `fs`.
 * @param path - absolute interpreter or install path to remember.
 */
export declare function appendPinnedPath(ctx: Context, path: string): Promise<void>;
/**
 * Remove a remembered path (by original path or by `custom:<name>` address).
 * @param ctx - host context carrying `fs`.
 * @param addressOrPath - `custom:<name>`, the display name, or the original path.
 * @param entries - current catalog used to resolve a `custom:` address.
 * @returns whether a row was removed.
 */
export declare function removePinnedPath(ctx: Context, addressOrPath: string, entries: readonly EnvEntry[]): Promise<boolean>;
//# sourceMappingURL=pin-cache.d.ts.map