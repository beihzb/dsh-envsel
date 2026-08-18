/**
 * Browser gateway for envsel. The instance is created inside the envsel plugin
 * body and provided as the `envsel` service, so its handlers share the
 * plugin's catalog cache and per-session selection state instead of owning a
 * second copy. The `@Remote` decorator markers are discovered at runtime by the
 * api gateway through the service's typert binding; the client half mounts the
 * matching generated contribution (`./typert-remote`) in this package's
 * browser bundle.
 *
 * @module dsh-envsel/remote
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { EnvselCatalogValue, EnvselGetRequest, EnvselGetResult, EnvselPinRequest, EnvselPinResult, EnvselSetRequest, EnvselSetResult, EnvselUnpinRequest, EnvselUnpinResult } from './types.ts';
import type { EnvSlot, SessionId } from './types.ts';
/** Business operations the plugin body implements against its own state. */
export interface EnvselGatewayHandlers {
    /** Read the environment catalog (cached by the plugin). */
    readonly list: () => Promise<EnvselCatalogValue>;
    /** Read one session's folded selection. */
    readonly get: (sessionId: SessionId) => EnvselGetResult;
    /** Assign one slot of one session by entry address ('' clears the slot). */
    readonly set: (sessionId: SessionId, slot: EnvSlot, address: string) => Promise<EnvselSetResult>;
    /** Remember one host path in the machine-local pin cache. */
    readonly pin: (path: string) => Promise<EnvselPinResult>;
    /** Drop one remembered path by entry address or original path. */
    readonly unpin: (address: string) => Promise<EnvselUnpinResult>;
}
/** Typert Remote service exposing the envsel catalog and session selection. */
export declare class EnvselRemoteService extends TypertRemoteService {
    private readonly handlers;
    /**
     * @param ctx - owning Host Context.
     * @param handlers - plugin-backed operations shared with the command/tool paths.
     */
    constructor(ctx: Context, handlers: EnvselGatewayHandlers);
    /** Full environment catalog for the browser dropdowns. */
    list(): Promise<EnvselCatalogValue>;
    /** Current folded selection of the addressed session. */
    get(request: EnvselGetRequest): EnvselGetResult;
    /** Assign one slot of the addressed session. */
    set(request: EnvselSetRequest): Promise<EnvselSetResult>;
    /**
     * Remember one host path and return the refreshed catalog.
     * @param request - absolute interpreter or install path.
     * @returns the catalog after the pin, or an explicit probe failure.
     */
    pin(request: EnvselPinRequest): Promise<EnvselPinResult>;
    /**
     * Forget one remembered path and return the refreshed catalog.
     * @param request - `custom:<name>` address or the original host path.
     * @returns the catalog after the unpin, or an explicit missing-entry failure.
     */
    unpin(request: EnvselUnpinRequest): Promise<EnvselUnpinResult>;
}
export default EnvselRemoteService;
//# sourceMappingURL=remote.d.ts.map