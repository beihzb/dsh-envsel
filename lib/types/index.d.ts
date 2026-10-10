/**
 * envsel — session environment selector for DeepSeek Harness. Per-language
 * slots (`python`, `r`, `cli`) each hold one first-priority environment drawn
 * from conda, standalone R installs, WSL distributions, or user-pinned custom
 * paths. Selections persist in a machine-local JSON store keyed by session id
 * (never the session event log — see state.ts), reach the model as a
 * per-turn runtime-context block and as `DSH_ENV_*` facts on every shell call,
 * and are changed from the browser via the `/env` command, the `session_env`
 * model tool, or the `envsel` Typert Remote that backs the header dropdown.
 * A session with no selection of its own inherits the nearest selecting
 * session it descends from, so delegated work keeps the environment its
 * parent chose.
 *
 * @module @beihaizb/dsh-envsel
 */
import type { Context } from '@deepseek-ai/cordis';
import type { EnvEntry, EnvSelection, EnvSlot, SessionId } from './types.ts';
export { defaultStandaloneRRoots, isWindowsHost, joinPath, prefixFromRscript, probeCustomPath, } from './discover.ts';
export { parsePinnedDocument, PINNED_FILE_NAME, serializePinnedDocument } from './pin-cache.ts';
export { parseStateDocument, serializeStateDocument, STATE_FILE_NAME } from './state.ts';
export type * from './types.ts';
export { EnvselRemoteService } from './remote.ts';
export type { EnvselGatewayHandlers } from './remote.ts';
export type { DiscoverConfig, DiscoverResult } from './discover.ts';
export declare const name = "envsel";
/** Hard dependencies: every service ships in the official DSH host plane. */
export declare const inject: string[];
/** Default catalog cache TTL in milliseconds. */
export declare const LIST_TTL_MS_DEFAULT = 300000;
/** Default conda executable name. */
export declare const CONDA_COMMAND_DEFAULT = "conda";
/** Default per-probe watchdog timeout in milliseconds. */
export declare const PROBE_TIMEOUT_MS_DEFAULT = 20000;
/**
 * Order of envsel's runtime-context block. The official blocks occupy 110
 * (sandbox policy), 115 (approval policy) and 120 (subagent delegation), so a
 * selection is rendered after every policy block and before any later
 * contribution — a stable position keeps the durable snapshot from churning.
 */
export declare const PROMPT_CONTEXT_ORDER = 130;
/**
 * Maximum delegating-session hops walked when a session has no selection of
 * its own. A DSH subagent runs in its own session (`origin: "subagent"`,
 * `delegationDepth: n`) whose header still names the session that delegated to
 * it, so the walk lets delegated work inherit the environment its parent
 * chose instead of silently falling back to the host default.
 */
export declare const MAX_INHERIT_HOPS = 8;
/** Name of envsel's runtime-context contribution. */
export declare const PROMPT_CONTEXT_NAME = "envsel:session-environment";
/** envsel deployment configuration (every field optional; schema defaults apply). */
export interface Config {
    /** Catalog cache TTL in milliseconds. */
    readonly listTtlMs?: number;
    /** Conda executable name or absolute path. */
    readonly condaCommand?: string;
    /** Extra standalone-R roots scanned after the Program Files defaults. */
    readonly standaloneRRoots?: string[];
    /** Whether WSL discovery is enabled. */
    readonly wslEnabled?: boolean;
    /** Whether the `session_env` model tool is registered. */
    readonly registerTool?: boolean;
    /**
     * Whether the selection is contributed to the per-turn runtime context.
     * Requires a host that binds the assembling agent to its context providers
     * (DSH 0.2.0-rc.1 and newer); on an older host the contribution renders
     * nothing and this switch has no effect.
     */
    readonly registerContext?: boolean;
    /** Per-probe hard timeout in milliseconds (watchdog terminate). */
    readonly probeTimeoutMs?: number;
}
/** Parse one `/env` command line. */
type EnvLineAction = {
    kind: 'show';
} | {
    kind: 'help';
} | {
    kind: 'clear';
} | {
    kind: 'wsl';
} | {
    kind: 'add';
    path: string;
} | {
    kind: 'unpin';
    address: string;
} | {
    kind: 'list';
    filter: string;
} | {
    kind: 'assign';
    assignments: ReadonlyArray<{
        slot: EnvSlot;
        value: string;
    }>;
} | {
    kind: 'error';
    text: string;
};
/** Parse the raw input of a `/env` invocation into an action. */
export declare function parseEnvLine(rawInput: string, locale?: 'en' | 'zh'): EnvLineAction;
/** Whether an entry can serve a slot (its language must be present). */
export declare function slotCompatible(slot: EnvSlot, entry: EnvEntry): boolean;
/** Human-readable one-line summary of an entry. */
export declare function describeEntry(entry: EnvEntry): string;
/** Render the runtime-context block for one selection. */
export declare function selectionContext(selection: EnvSelection): string;
/**
 * Resolve a session's effective selection. A session's own entry always wins;
 * otherwise the nearest selection owned by a session it descends from is used,
 * walking `parentOf` at most `maxHops` times.
 *
 * Delegated work runs in its own session — a DSH subagent child records the
 * session that delegated to it in `header.parentSession` — so without the walk
 * a subagent would silently fall back to the host default instead of the
 * environment the delegating session selected.
 *
 * Free of host services on purpose: the resolution order is the part worth
 * testing, and it stays testable only while it needs nothing but the map.
 *
 * @param sessionId - the session to resolve.
 * @param selections - folded selections keyed by session id.
 * @param parentOf - the delegating session of a session, when one is known.
 * @param maxHops - hard bound on the ancestor walk.
 * @returns the effective selection, or an empty object when none applies.
 */
export declare function resolveSelection(sessionId: SessionId, selections: ReadonlyMap<string, EnvSelection>, parentOf: (sessionId: SessionId) => SessionId | undefined, maxHops?: number): EnvSelection;
/** Usage text for the /env command. */
export declare function envHelpText(locale?: 'en' | 'zh'): string;
/**
 * PATH-prefix guidance for the CLI slot, matching the host shell family.
 * @param entry - selected CLI environment.
 * @param platform - Node platform string; defaults to `process.platform`.
 * @returns one copy-pasteable PATH line for the model snapshot.
 */
export declare function cliPathGuidance(entry: EnvEntry, platform?: NodeJS.Platform): string;
/** The registered `session_env` tool name. */
export declare const SESSION_ENV_TOOL = "session_env";
/**
 * Install the envsel command, prompt context, shell facts, and model tool.
 * @param ctx - registrant context carrying every injected service.
 * @param config - deployment's explicit envsel policy.
 */
export declare function apply(ctx: Context, config: Config): Promise<void>;
//# sourceMappingURL=index.d.ts.map