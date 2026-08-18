/**
 * envsel — session environment selector for DeepSeek Harness. Per-language
 * slots (`python`, `r`, `cli`) each hold one first-priority environment drawn
 * from conda, standalone R installs, WSL distributions, or user-pinned custom
 * paths. Selections persist in a machine-local JSON store keyed by session id
 * (never the session event log — see state.ts), are injected into every shell
 * call as `DSH_ENV_*` facts, and are changed from the browser via the `/env`
 * command, the `session_env` model tool, or the `envsel` Typert Remote that
 * backs the header dropdown.
 *
 * @module @beihzb/dsh-envsel
 */
import type { Context } from '@deepseek-ai/cordis';
import type { EnvEntry, EnvSelection, EnvSlot } from './types.ts';
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
export declare function parseEnvLine(rawInput: string): EnvLineAction;
/** Whether an entry can serve a slot (its language must be present). */
export declare function slotCompatible(slot: EnvSlot, entry: EnvEntry): boolean;
/** Human-readable one-line summary of an entry. */
export declare function describeEntry(entry: EnvEntry): string;
/** Render the runtime-context block for one selection. */
export declare function selectionContext(selection: EnvSelection): string;
/** Usage text for the /env command. */
export declare function envHelpText(): string;
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