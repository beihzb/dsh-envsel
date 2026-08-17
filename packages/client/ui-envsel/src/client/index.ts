/**
 * Session environment selector, browser half: one header utility that opens
 * per-language (Python / R / CLI tools) dropdowns over the generated `envsel`
 * Remote. The selection is session-owned and shared with the `/env` command,
 * the `session_env` tool, and the runtime context through the durable
 * `envsel/selection` session event.
 * @module @deepseek-ai/dsh-client-ui-envsel/client
 */

// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { EnvSlot } from '@deepseek-ai/dsh-envsel/types'
import { EnvselHeaderButton } from './EnvselHeaderButton.tsx'
import type { EnvselHeaderButtonInjected, EnvselRemoteOutcome } from './EnvselHeaderButton.tsx'
import { en, NS, zh, type EnvselLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Session environment selector copy. */
    'session.envsel': EnvselLocaleKey
  }
}

export type { EnvselHeaderButtonInjected, EnvselHeaderButtonProps, EnvselRemoteOutcome } from './EnvselHeaderButton.tsx'
export type { EnvselLocaleKey } from './locales.ts'

/** Required services: the slot registry, the Remote namespace, and the copy. */
export const inject = ['slots', 'locale', 'remote', 'remote.envsel']

/** Rejected outcome built from a transport throw. */
function transportFailure(error: unknown): EnvselRemoteOutcome<never> {
  return {
    ok: false,
    error: {
      code: 'transport',
      message: error instanceof Error ? error.message : 'envsel request failed',
    },
  }
}

/**
 * Client plugin body: register the dictionaries and the header utility.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-envsel: dictionaries')

  const injected = (): EnvselHeaderButtonInjected => ({
    listCatalog: async () => {
      try {
        const carried = await ctx.remote.envsel.list()
        if (!carried.ok) return { ok: false, error: carried.error }
        return { ok: true, value: carried.value }
      } catch (error) {
        return transportFailure(error)
      }
    },
    getSelection: async (id) => {
      try {
        const carried = await ctx.remote.envsel.get({ sessionId: id })
        if (!carried.ok) return { ok: false, error: carried.error }
        const business = carried.value
        return business.ok
          ? { ok: true, value: business.value }
          : { ok: false, error: { code: business.error.code, message: business.error.code } }
      } catch (error) {
        return transportFailure(error)
      }
    },
    setSelection: async (id, slot: EnvSlot, address: string) => {
      try {
        const carried = await ctx.remote.envsel.set({ sessionId: id, slot, address })
        if (!carried.ok) return { ok: false, error: carried.error }
        const business = carried.value
        return business.ok
          ? { ok: true, value: business.value }
          : { ok: false, error: { code: business.error.code, message: business.error.code } }
      } catch (error) {
        return transportFailure(error)
      }
    },
    pinPath: async (path) => {
      try {
        const carried = await ctx.remote.envsel.pin({ path })
        if (!carried.ok) return { ok: false, error: carried.error }
        const business = carried.value
        return business.ok
          ? { ok: true, value: business.value }
          : { ok: false, error: { code: business.error.code, message: business.error.code } }
      } catch (error) {
        return transportFailure(error)
      }
    },
    unpinPath: async (address) => {
      try {
        const carried = await ctx.remote.envsel.unpin({ address })
        if (!carried.ok) return { ok: false, error: carried.error }
        const business = carried.value
        return business.ok
          ? { ok: true, value: business.value }
          : { ok: false, error: { code: business.error.code, message: business.error.code } }
      } catch (error) {
        return transportFailure(error)
      }
    },
  })

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'envsel',
    order: 10,
    locale: NS,
    inject: injected,
  }, EnvselHeaderButton))
}