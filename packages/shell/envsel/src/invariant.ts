/** Package-owned envsel selection-stream invariants. @module @deepseek-ai/dsh-envsel/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { ENV_SLOTS } from './types.ts'
import type { EnvSlot } from './types.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-envsel'

/** Cordis companion plugin name. */
export const name = 'envsel-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** Validate one `envsel/selection` snapshot: object slots, known keys, well-formed entries. */
function validateSelection(data: unknown, fail: InvariantFailure): void {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    fail('envsel/selection data must be an object')
    return
  }
  const slots = (data as { slots?: unknown }).slots
  if (slots === null || typeof slots !== 'object' || Array.isArray(slots)) {
    fail('envsel/selection slots must be an object')
    return
  }
  for (const [rawKey, value] of Object.entries(slots)) {
    const slot = rawKey as EnvSlot
    if (!ENV_SLOTS.includes(slot)) {
      fail(`envsel/selection carries unknown slot ${JSON.stringify(rawKey)}`)
      continue
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      fail(`envsel/selection slot ${rawKey} must hold an entry object`)
      continue
    }
    const entry = value as { kind?: unknown; name?: unknown; prefix?: unknown }
    if (typeof entry.kind !== 'string' || entry.kind.length === 0) {
      fail(`envsel/selection slot ${rawKey} entry kind must be a non-empty string`)
    }
    if (typeof entry.name !== 'string' || entry.name.length === 0) {
      fail(`envsel/selection slot ${rawKey} entry name must be a non-empty string`)
    }
    if (typeof entry.prefix !== 'string' || entry.prefix.length === 0) {
      fail(`envsel/selection slot ${rawKey} entry prefix must be a non-empty string`)
    }
  }
}

/** Install closed-vocabulary checks for the envsel selection stream. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  const seed = (session: Session): void => {
    for (const event of session.events) {
      if (event.type === 'envsel/selection') validateSelection(event.data, fail)
    }
  }
  for (const session of ctx.sessions.list()) seed(session)
  ctx.on('session/created', (session) => { seed(session) }, { global: true })
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'envsel/selection') validateSelection(event.data, fail)
  }, { global: true })
}, { inject: ['sessions'] })

/**
 * Register the envsel invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
