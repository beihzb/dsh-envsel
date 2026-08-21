/**
 * Host-side product copy for `/env` and catalog warnings.
 * English is the default; Chinese is used when DSH settings store
 * `locale.preference = zh`.
 *
 * @module @beihaizb/dsh-envsel/copy
 */
import type { Context } from '@deepseek-ai/cordis';
import type { EnvSlot } from './types.ts';
/** Locales this plugin ships for host-visible copy. */
export type HostLocale = 'en' | 'zh';
/**
 * Resolve the host copy locale. Missing settings, a missing preference, or
 * any value other than `zh` falls back to English.
 * @param ctx - host context; `settings` is optional.
 * @returns `zh` when the user explicitly chose Chinese, otherwise `en`.
 */
export declare function resolveHostLocale(ctx: Context): HostLocale;
/** Slot labels in the active locale (`CLI tools` vs `CLI 工具`). */
export declare function slotLabel(slot: EnvSlot, locale: HostLocale): string;
interface HostCopy {
    usageAdd: string;
    usageUnpin: string;
    unknownArg: (token: string) => string;
    unknownSlot: (slot: string) => string;
    help: string;
    commandDescription: string;
    commandHint: string;
    cleared: string;
    wslSkipped: string;
    wslDone: (count: number) => string;
    wslNone: string;
    addFailed: (path: string, reason: string) => string;
    pinReasonInvalid: string;
    pinReasonNotFound: string;
    pinReasonNoInterpreter: string;
    pinned: (hint: string) => string;
    unpinMissing: (address: string) => string;
    unpinned: (address: string) => string;
    listHeader: (count: number, filter: string) => string;
    slotUnset: string;
    slotAmbiguous: (entries: string) => string;
    slotMissing: (value: string) => string;
    slotSetFailed: (slot: string, hint: string) => string;
    slotIncompatible: (slot: string, entry: string) => string;
    updated: string;
    noneSelected: string;
    noneSelectedHint: string;
    currentEnv: string;
    unsetParen: string;
    usageHelp: string;
    condaListFailed: (cmd: string, error: string) => string;
    condaExit: (code: string, detail: string) => string;
    condaParse: (error: string) => string;
    condaShape: string;
    wslUnavailable: (error: string) => string;
    wslListExit: (code: string, detail: string) => string;
    wslProbeFailed: (distro: string, error: string) => string;
    wslProbeExit: (distro: string, code: string, stderr: string) => string;
    wslParse: (distro: string, error: string) => string;
    wslShape: (distro: string) => string;
    pinUnavailable: (code: string, path: string) => string;
}
/**
 * Host copy for one locale. English is the default.
 * @param locale - active host locale.
 */
export declare function hostCopy(locale?: HostLocale): HostCopy;
export {};
//# sourceMappingURL=copy.d.ts.map