/**
 * Shared envsel vocabulary: environment entry shapes and language slots.
 * Client-safe — nothing here reaches a Host-only symbol.
 *
 * @module @beihzb/dsh-envsel/types
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types';
export type { SessionId } from '@deepseek-ai/dsh-session/types';
/** One language/use slot that can hold a first-priority environment. */
export type EnvSlot = 'python' | 'r' | 'cli';
/** Every supported slot, in canonical display order. */
export declare const ENV_SLOTS: readonly EnvSlot[];
/** Human-readable slot labels (product copy is Chinese). */
export declare const ENV_SLOT_LABELS: Readonly<Record<EnvSlot, string>>;
/** Provenance of a discovered environment entry. */
export type EnvKind = 'conda' | 'r' | 'wsl' | 'custom';
/**
 * One selectable environment entry. `prefix` is the install root; for a
 * `wsl` entry it is the Linux absolute path inside the distribution. The
 * `*Command` fields carry the copy-pasteable invocation form (a Windows
 * absolute path for native entries, a `wsl.exe -d <distro> -- …` command for
 * WSL entries) so consumers never re-derive platform specifics. A type alias
 * (not an interface) so the shape stays assignable to JSON value records.
 */
export type EnvEntry = {
    /** Where the entry came from. */
    readonly kind: EnvKind;
    /** Display name (`base`, `scRNAv2`, `R-4.4.1`, …). */
    readonly name: string;
    /** Install root: Windows path for native entries, Linux path for WSL. */
    readonly prefix: string;
    /** Absolute python executable inside the entry, when one is known. */
    readonly python: string | null;
    /** Absolute Rscript executable inside the entry, when one is known. */
    readonly rscript: string | null;
    /** WSL distribution owning a `wsl` entry. */
    readonly distro?: string;
    /** Copy-pasteable python invocation (`C:\…\python.exe` or `wsl.exe -d … -- …`). */
    readonly pythonCommand?: string;
    /** Copy-pasteable Rscript invocation. */
    readonly rscriptCommand?: string;
};
/** One slot assignment: the exact entry chosen for that slot. */
export type EnvSelection = Partial<Record<EnvSlot, EnvEntry>>;
/** Stable address used to reference an entry from a command line or tool. */
export interface EnvRef {
    readonly kind: EnvKind;
    readonly name: string;
    readonly distro?: string;
}
/** True when the selection contains no slot assignments. */
export declare function isEmptySelection(selection: EnvSelection): boolean;
/** Stable reference string of an entry, used for display and matching. */
export declare function entryAddress(entry: EnvEntry): string;
/** Whether a reference matches an entry (name-only or exact address). */
export declare function refMatchesEntry(ref: EnvRef, entry: EnvEntry): boolean;
/** One successful Remote reply branch. */
export interface EnvselSuccess<T> {
    readonly ok: true;
    readonly value: T;
}
/** One rejected Remote reply branch. */
export interface EnvselRejected<E> {
    readonly ok: false;
    readonly error: E;
}
/** Full environment catalog served to the browser. */
export interface EnvselCatalogValue {
    readonly entries: readonly EnvEntry[];
    readonly warnings: readonly string[];
}
/** The addressed session is not live in the session store. */
export interface EnvselSessionNotFound {
    readonly code: 'session-not-found';
    readonly sessionId: SessionId;
}
/** `get` request: read the current selection of one session. */
export interface EnvselGetRequest {
    readonly sessionId: SessionId;
}
/** `get` success payload: the folded session selection. */
export interface EnvselGetValue {
    readonly selection: EnvSelection;
}
/** `get` reply: the selection, or an explicit session failure. */
export type EnvselGetResult = EnvselSuccess<EnvselGetValue> | EnvselRejected<EnvselSessionNotFound>;
/** `set` request: assign one slot of one session by entry address ('' clears). */
export interface EnvselSetRequest {
    readonly sessionId: SessionId;
    readonly slot: EnvSlot;
    readonly address: string;
}
/** Every explicit `set` failure branch. */
export type EnvselSetFailure = EnvselSessionNotFound | {
    readonly code: 'unknown-slot';
    readonly sessionId: SessionId;
    readonly slot: string;
} | {
    readonly code: 'entry-not-found';
    readonly sessionId: SessionId;
    readonly slot: EnvSlot;
    readonly address: string;
} | {
    readonly code: 'incompatible';
    readonly sessionId: SessionId;
    readonly slot: EnvSlot;
    readonly address: string;
};
/** `set` reply: the committed selection, or an explicit failure. */
export type EnvselSetResult = EnvselSuccess<EnvselGetValue> | EnvselRejected<EnvselSetFailure>;
/** `pin` request: remember one host path in the machine-local cache. */
export interface EnvselPinRequest {
    readonly path: string;
}
/** Every explicit `pin` failure branch. */
export type EnvselPinFailure = {
    readonly code: 'invalid-path';
    readonly path: string;
} | {
    readonly code: 'not-found';
    readonly path: string;
} | {
    readonly code: 'no-interpreter';
    readonly path: string;
};
/** `pin` reply: the refreshed catalog, or an explicit failure. */
export type EnvselPinResult = EnvselSuccess<EnvselCatalogValue> | EnvselRejected<EnvselPinFailure>;
/** `unpin` request: drop one cached path by entry address or original path. */
export interface EnvselUnpinRequest {
    readonly address: string;
}
/** `unpin` reply: the refreshed catalog, or an explicit missing-entry failure. */
export type EnvselUnpinResult = EnvselSuccess<EnvselCatalogValue> | EnvselRejected<{
    readonly code: 'entry-not-found';
    readonly address: string;
}>;
//# sourceMappingURL=types.d.ts.map