/**
 * Ambient merge of the generated `envsel` Remote namespace onto the typert
 * client maps, so this package's browser half can call `ctx.remote.envsel`
 * with full types. Mirrors what the api/remotes assembly used to contribute
 * for an in-repo package; a downstream plugin owns its own merge.
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
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
} from '../types.js'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$656e7673656c {
    get: (request: EnvselGetRequest) => Promise<RemoteResult<EnvselGetResult>>
    list: () => Promise<RemoteResult<EnvselCatalogValue>>
    pin: (request: EnvselPinRequest) => Promise<RemoteResult<EnvselPinResult>>
    set: (request: EnvselSetRequest) => Promise<RemoteResult<EnvselSetResult>>
    unpin: (request: EnvselUnpinRequest) => Promise<RemoteResult<EnvselUnpinResult>>
  }
  interface TypertRemoteMap {
    'envsel/get': (request: EnvselGetRequest) => Promise<RemoteResult<EnvselGetResult>>
    'envsel/list': () => Promise<RemoteResult<EnvselCatalogValue>>
    'envsel/pin': (request: EnvselPinRequest) => Promise<RemoteResult<EnvselPinResult>>
    'envsel/set': (request: EnvselSetRequest) => Promise<RemoteResult<EnvselSetResult>>
    'envsel/unpin': (request: EnvselUnpinRequest) => Promise<RemoteResult<EnvselUnpinResult>>
  }
  interface TypertRemoteNamespaceMap {
    'envsel': TypertRemoteNamespace$656e7673656c
  }
}
