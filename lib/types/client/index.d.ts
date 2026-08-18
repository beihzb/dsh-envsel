/**
 * Session environment selector, browser half: one header utility that opens
 * per-language (Python / R / CLI tools) dropdowns over the generated `envsel`
 * Remote. The selection is session-owned and shared with the `/env` command,
 * the `session_env` tool, and the DSH_ENV_* shell facts.
 * @module @beihaizb/dsh-envsel/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type EnvselLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Session environment selector copy. */
        'session.envsel': EnvselLocaleKey;
    }
}
export type { EnvselHeaderButtonInjected, EnvselHeaderButtonProps, EnvselRemoteOutcome } from './EnvselHeaderButton.tsx';
export type { EnvselLocaleKey } from './locales.ts';
/** Required services: the slot registry, the Remote service, and the copy. */
export declare const inject: string[];
/**
 * Client plugin body: mount the envsel Remote, register the dictionaries and
 * the header utility.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): Promise<void>;
//# sourceMappingURL=index.d.ts.map