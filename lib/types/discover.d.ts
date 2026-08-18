/**
 * Environment discovery for envsel: conda environments, standalone R
 * installations, and WSL distributions. All discovery goes through the
 * injected `subprocess` and `fs` services — never node:child_process — so the
 * package stays on the harness's process-sandbox seam and its spawns are
 * tree-scoped and observable.
 *
 * @module @deepseek-ai/dsh-envsel/discover
 */
import type { Context } from '@deepseek-ai/cordis';
import type { EnvEntry } from './types.ts';
/** Discovery timeout policy shared by every subprocess probe. */
export interface DiscoverConfig {
    /** Conda executable name or absolute path (default `conda`). */
    readonly condaCommand: string;
    /** Extra standalone-R roots scanned after the Program Files defaults. */
    readonly standaloneRRoots: readonly string[];
    /** Whether WSL discovery is enabled at all. */
    readonly wslEnabled: boolean;
    /** Per-probe hard timeout in milliseconds (watchdog terminate). */
    readonly probeTimeoutMs: number;
}
/** Result of one discovery pass: entries plus human-readable warnings. */
export interface DiscoverResult {
    readonly entries: EnvEntry[];
    readonly warnings: string[];
}
/** Last path segment of a Windows or POSIX path. */
export declare function baseName(path: string): string;
/**
 * True when the host is Windows (WSL and Program Files live here only).
 * @param platform - Node platform string; defaults to `process.platform`.
 * @returns whether the platform is `win32`.
 */
export declare function isWindowsHost(platform?: NodeJS.Platform): boolean;
/**
 * Join one parent and one child using the host's path separator.
 * @param parent - existing prefix; a trailing slash is stripped.
 * @param child - single path segment to append.
 * @param platform - Node platform string; defaults to `process.platform`.
 * @returns `parent` + separator + `child`.
 */
export declare function joinPath(parent: string, child: string, platform?: NodeJS.Platform): string;
/**
 * Reconstruct an install prefix from an absolute Rscript path, keeping the
 * original separator and a POSIX leading slash.
 * @param rscript - absolute interpreter path (python or Rscript).
 * @returns the install prefix above `bin` / `Scripts` / `Resources`.
 */
export declare function prefixFromRscript(rscript: string): string;
/**
 * Default standalone-R scan roots for the host platform (missing roots are skipped).
 * @param platform - Node platform string; defaults to `process.platform`.
 * @returns the platform's well-known R install roots.
 */
export declare function defaultStandaloneRRoots(platform?: NodeJS.Platform): readonly string[];
/**
 * Spawn one argv and collect bounded stdout/stderr, terminating after
 * `timeoutMs`. Returns `{ exitCode, stdout, stderr }`.
 */
export declare function runProbe(ctx: Context, argv: readonly string[], timeoutMs: number): Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
}>;
/** Probe `ctx.fs` for the first existing candidate path, or null. */
export declare function firstExisting(ctx: Context, candidates: readonly string[]): Promise<string | null>;
/** Discover conda environments via `conda env list --json`. */
export declare function discoverConda(ctx: Context, config: DiscoverConfig): Promise<{
    entries: EnvEntry[];
    error?: string;
}>;
/** Discover standalone R installations: platform defaults, PATH, and configured roots. */
export declare function discoverStandaloneR(ctx: Context, config: DiscoverConfig): Promise<EnvEntry[]>;
/**
 * List WSL distributions via `wsl.exe --list --quiet`. WSL writes UTF-16LE to
 * stdout on Windows; decode accordingly. A non-zero exit or empty list means
 * WSL is unavailable.
 */
export declare function wslDistros(ctx: Context, config: DiscoverConfig): Promise<{
    distros: string[];
    error?: string;
}>;
/** Probe one WSL distribution for conda environments and system interpreters. */
export declare function discoverWslDistro(ctx: Context, config: DiscoverConfig, distro: string): Promise<{
    entries: EnvEntry[];
    error?: string;
}>;
/** Full discovery pass used by the catalog cache. */
export declare function discoverAll(ctx: Context, config: DiscoverConfig): Promise<DiscoverResult>;
/** Why a user-supplied path could not become a catalog entry. */
export type ProbeCustomFailure = 'invalid-path' | 'not-found' | 'no-interpreter';
/** Result of probing one user-supplied interpreter or install prefix. */
export type ProbeCustomResult = {
    readonly ok: true;
    readonly entry: EnvEntry;
} | {
    readonly ok: false;
    readonly code: ProbeCustomFailure;
};
/**
 * Probe one user-supplied path (interpreter file or install directory) and
 * build a `custom` catalog entry when a python or Rscript is present.
 * @param ctx - host context carrying `fs`.
 * @param rawPath - path the user typed; leading/trailing whitespace is ignored.
 * @returns the entry, or a structured reason the path cannot be pinned.
 */
export declare function probeCustomPath(ctx: Context, rawPath: string): Promise<ProbeCustomResult>;
//# sourceMappingURL=discover.d.ts.map