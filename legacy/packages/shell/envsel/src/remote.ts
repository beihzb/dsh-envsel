/**
 * Browser gateway for envsel. The instance is created inside the envsel plugin
 * body and provided as the `envsel` service, so its handlers share the
 * plugin's catalog cache and per-session selection state instead of owning a
 * second copy. The `./remote` artifact generated from this class is mounted by
 * the api/remotes client assembly, and the api gateway resolves the `envsel`
 * service from the live Context on every invocation.
 *
 * @module @deepseek-ai/dsh-envsel/remote
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  EnvselCatalogValue,
  EnvselGetRequest,
  EnvselGetResult,
  EnvselPinRequest,
  EnvselPinResult,
  EnvselSetRequest,
  EnvselSetResult,
  EnvselUnpinRequest,
  EnvselUnpinResult,
} from './types.ts'
import type { EnvSlot, SessionId } from './types.ts'

/** Business operations the plugin body implements against its own state. */
export interface EnvselGatewayHandlers {
  /** Read the environment catalog (cached by the plugin). */
  readonly list: () => Promise<EnvselCatalogValue>
  /** Read one session's folded selection. */
  readonly get: (sessionId: SessionId) => EnvselGetResult
  /** Assign one slot of one session by entry address ('' clears the slot). */
  readonly set: (sessionId: SessionId, slot: EnvSlot, address: string) => Promise<EnvselSetResult>
  /** Remember one host path in the machine-local pin cache. */
  readonly pin: (path: string) => Promise<EnvselPinResult>
  /** Drop one remembered path by entry address or original path. */
  readonly unpin: (address: string) => Promise<EnvselUnpinResult>
}

/** Typert Remote service exposing the envsel catalog and session selection. */
export class EnvselRemoteService extends TypertRemoteService {
  /**
   * @param ctx - owning Host Context.
   * @param handlers - plugin-backed operations shared with the command/tool paths.
   */
  constructor(ctx: Context, private readonly handlers: EnvselGatewayHandlers) {
    super(ctx, 'envsel')
  }

  /** Full environment catalog for the browser dropdowns. */
  @Remote('list')
  list(): Promise<EnvselCatalogValue> {
    return this.handlers.list()
  }

  /** Current folded selection of the addressed session. */
  @Remote('get')
  get(request: EnvselGetRequest): EnvselGetResult {
    return this.handlers.get(request.sessionId)
  }

  /** Assign one slot of the addressed session. */
  @Remote('set')
  set(request: EnvselSetRequest): Promise<EnvselSetResult> {
    return this.handlers.set(request.sessionId, request.slot, request.address)
  }

  /**
   * Remember one host path and return the refreshed catalog.
   * @param request - absolute interpreter or install path.
   * @returns the catalog after the pin, or an explicit probe failure.
   */
  @Remote('pin')
  pin(request: EnvselPinRequest): Promise<EnvselPinResult> {
    return this.handlers.pin(request.path)
  }

  /**
   * Forget one remembered path and return the refreshed catalog.
   * @param request - `custom:<name>` address or the original host path.
   * @returns the catalog after the unpin, or an explicit missing-entry failure.
   */
  @Remote('unpin')
  unpin(request: EnvselUnpinRequest): Promise<EnvselUnpinResult> {
    return this.handlers.unpin(request.address)
  }
}

export default EnvselRemoteService
