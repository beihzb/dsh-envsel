// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import { NS } from '../src/client/locales.ts'
import { EnvselHeaderButton } from '../src/client/EnvselHeaderButton.tsx'
import type { EnvselHeaderButtonInjected } from '../src/client/EnvselHeaderButton.tsx'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

const EMPTY_CATALOG = { entries: [], warnings: [] }
type WireResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  new RemoteService(ctx)
  const list = vi.fn<() => Promise<WireResult<typeof EMPTY_CATALOG>>>()
    .mockResolvedValue({ ok: true, value: EMPTY_CATALOG })
  const get = vi.fn<() => Promise<WireResult<unknown>>>()
    .mockResolvedValue({ ok: true, value: { ok: true, value: { selection: {} } } })
  const set = vi.fn<() => Promise<WireResult<unknown>>>()
    .mockResolvedValue({ ok: true, value: { ok: true, value: { selection: {} } } })
  const pin = vi.fn<() => Promise<WireResult<unknown>>>()
    .mockResolvedValue({ ok: true, value: { ok: true, value: EMPTY_CATALOG } })
  const unpin = vi.fn<() => Promise<WireResult<unknown>>>()
    .mockResolvedValue({ ok: true, value: { ok: true, value: EMPTY_CATALOG } })
  ctx.provide('remote.envsel', { list, get, set, pin, unpin })
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, list, get, set, pin, unpin }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'conversation.session.header.utilities': { kind: 'list', scope: 'session' } },
  } as never, () => null)
}

describe('ui-envsel browser plugin', () => {
  it('declares only the services used by the header Remote contribution', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.envsel'])
  })

  it('registers a localized header utility without reading the Remote eagerly', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('conversation.session.header.utilities')[0]!
    expect(entry.component).toBe(EnvselHeaderButton)
    expect(entry.options).toMatchObject({ id: 'envsel', order: 10 })
    expect(entry.locale).toBe(NS)
    expect(b.list).not.toHaveBeenCalled()
    expect(b.get).not.toHaveBeenCalled()

    const injected = (entry.inject as unknown as (sessionId: string) => EnvselHeaderButtonInjected)('s1')
    await expect(injected.listCatalog()).resolves.toEqual({ ok: true, value: EMPTY_CATALOG })
    expect(b.list).toHaveBeenCalledOnce()
    await expect(injected.getSelection('s1' as SessionId)).resolves.toEqual({ ok: true, value: { selection: {} } })
    await expect(injected.setSelection('s1' as SessionId, 'python', 'conda:base'))
      .resolves.toEqual({ ok: true, value: { selection: {} } })
    expect(b.set).toHaveBeenCalledWith({ sessionId: 's1', slot: 'python', address: 'conda:base' })
    await expect(injected.pinPath('/usr/bin/Rscript')).resolves.toEqual({ ok: true, value: EMPTY_CATALOG })
    expect(b.pin).toHaveBeenCalledWith({ path: '/usr/bin/Rscript' })
    await expect(injected.unpinPath('custom:usr')).resolves.toEqual({ ok: true, value: EMPTY_CATALOG })
    expect(b.unpin).toHaveBeenCalledWith({ address: 'custom:usr' })
    await b.ctx.fiber.dispose()
  })

  it('recovers across late declaration and declarer reload', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(0)

    const stop = declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(1) })

    stop()
    expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => {
      expect(b.slots.entries('conversation.session.header.utilities')[0]?.component).toBe(EnvselHeaderButton)
    })

    await fiber.dispose()
    expect(b.slots.entries('conversation.session.header.utilities')).toHaveLength(0)
    expect(() => b.locale.register(NS, 'zh', {})).not.toThrow()
    await b.ctx.fiber.dispose()
  })
})
