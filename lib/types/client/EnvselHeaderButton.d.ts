/**
 * The session header's environment selector: one button that opens a panel of
 * per-language dropdowns (Python / R / CLI tools) over the `envsel` Remote.
 * Each slot holds one first-priority environment; the selection persists in
 * the machine-local envsel store and is shared with the `/env` command, the
 * `session_env` tool, and the DSH_ENV_* shell facts, so switching here is
 * exactly switching anywhere else.
 *
 * The catalog is only fetched when the panel first opens: probing conda and
 * WSL takes seconds, and a closed header must not pay that cost for every
 * session.
 */
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { EnvselCatalogValue, EnvselGetValue } from '../types.ts';
import type { EnvSlot } from '../types.ts';
import { NS } from './locales.ts';
/** One settled Remote call as the button renders it. */
export type EnvselRemoteOutcome<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly error: {
        readonly code: string;
        readonly message: string;
    };
};
/** Registration-side business face for the header selector. */
export interface EnvselHeaderButtonInjected {
    /** Read the environment catalog (fetched once per panel open). */
    listCatalog: () => Promise<EnvselRemoteOutcome<EnvselCatalogValue>>;
    /** Read the current session's folded selection. */
    getSelection: (sessionId: SessionId) => Promise<EnvselRemoteOutcome<EnvselGetValue>>;
    /** Assign one slot by entry address ('' clears the slot). */
    setSelection: (sessionId: SessionId, slot: EnvSlot, address: string) => Promise<EnvselRemoteOutcome<EnvselGetValue>>;
    /** Remember one host path in the machine-local cache and return the catalog. */
    pinPath: (path: string) => Promise<EnvselRemoteOutcome<EnvselCatalogValue>>;
    /** Forget one remembered path by entry address or original path. */
    unpinPath: (address: string) => Promise<EnvselRemoteOutcome<EnvselCatalogValue>>;
}
/** Full component props composed by the header utilities slot. */
export type EnvselHeaderButtonProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS> & InjectFace<EnvselHeaderButtonInjected>;
/**
 * Render this session's environment selector.
 * @param props - runtime slot currency, the translator, and the Remote face.
 * @returns the trigger button and its per-language panel.
 */
export declare function EnvselHeaderButton({ sessionId, t, listCatalog, getSelection, setSelection, pinPath, unpinPath, }: EnvselHeaderButtonProps): import("react").JSX.Element;
//# sourceMappingURL=EnvselHeaderButton.d.ts.map