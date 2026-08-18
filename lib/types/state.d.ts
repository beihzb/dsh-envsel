/**
 * Standalone per-session selection store for envsel. Selections live in a
 * machine-local JSON file (`$DSH_HOME/envsel-state.json`) keyed by session id,
 * NOT in the session event log: a downstream plugin's event type is unknown to
 * the harness's session-persistence reader, which refuses a log containing an
 * unrecognized non-ignorable event. Writing selection changes into the log
 * would therefore make the owning session unreadable after a restart, so the
 * plugin owns its own durable state instead.
 *
 * @module dsh-envsel/state
 */
import type { Context } from '@deepseek-ai/cordis';
import type { EnvSelection, SessionId } from './types.ts';
/** On-disk file name of the selection store under the harness home. */
export declare const STATE_FILE_NAME = "envsel-state.json";
/** Current on-disk document version. */
export declare const STATE_FILE_VERSION = 1;
/** The selection store document: one folded selection per session id. */
export interface StateDocument {
    readonly version: typeof STATE_FILE_VERSION;
    readonly selections: Record<string, EnvSelection>;
}
/**
 * Resolved selection-store path under the current harness home.
 * @returns the absolute `$DSH_HOME/envsel-state.json` path.
 */
export declare function statePath(): string;
/**
 * Parse the on-disk document into a session→selection map.
 * @param raw - file contents; invalid or version-mismatched JSON becomes an empty map.
 * @returns selections keyed by session id.
 */
export declare function parseStateDocument(raw: string): Record<string, EnvSelection>;
/**
 * Serialize the selection map as a stable versioned document.
 * @param selections - selections to persist.
 * @returns UTF-8 document with a trailing newline.
 */
export declare function serializeStateDocument(selections: Record<string, EnvSelection>): string;
/**
 * Read the whole selection map; a missing or unreadable file is empty.
 * @param ctx - host context carrying `fs`.
 * @returns selections keyed by session id.
 */
export declare function readAllSelections(ctx: Context): Promise<Record<string, EnvSelection>>;
/**
 * Replace the whole selection map (an empty map still writes).
 * @param ctx - host context carrying `fs`.
 * @param selections - complete replacement map.
 */
export declare function writeAllSelections(ctx: Context, selections: Record<string, EnvSelection>): Promise<void>;
/**
 * Read one session's folded selection.
 * @param ctx - host context carrying `fs`.
 * @param sessionId - the addressed session.
 * @returns the stored selection, or undefined when the session has none.
 */
export declare function readSessionSelection(ctx: Context, sessionId: SessionId): Promise<EnvSelection | undefined>;
/**
 * Persist one session's selection, replacing its previous value.
 * @param ctx - host context carrying `fs`.
 * @param sessionId - the addressed session.
 * @param selection - the new selection (empty object clears the session).
 */
export declare function writeSessionSelection(ctx: Context, sessionId: SessionId, selection: EnvSelection): Promise<void>;
//# sourceMappingURL=state.d.ts.map