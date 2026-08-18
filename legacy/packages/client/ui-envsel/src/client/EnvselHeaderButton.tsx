/**
 * The session header's environment selector: one button that opens a panel of
 * per-language dropdowns (Python / R / CLI tools) over the `envsel` Remote.
 * Each slot holds one first-priority environment; the selection lives in the
 * session log (`envsel/selection`) and is shared with the `/env` command, the
 * `session_env` tool, and the runtime context, so switching here is exactly
 * switching anywhere else.
 *
 * The catalog is only fetched when the panel first opens: probing conda and
 * WSL takes seconds, and a closed header must not pay that cost for every
 * session.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import { IconCheckOutline14, IconChevronDownOutline14, IconCloseFill14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { EnvselCatalogValue, EnvselGetValue } from '@deepseek-ai/dsh-envsel/types'
import type { EnvEntry, EnvSelection, EnvSlot } from '@deepseek-ai/dsh-envsel/types'
// Type-only: pulls the ui-conversation SlotMap merge (the header utilities entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { NS, type EnvselLocaleKey } from './locales.ts'
import css from './EnvselHeaderButton.module.css'

/** One settled Remote call as the button renders it. */
export type EnvselRemoteOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

/** Registration-side business face for the header selector. */
export interface EnvselHeaderButtonInjected {
  /** Read the environment catalog (fetched once per panel open). */
  listCatalog: () => Promise<EnvselRemoteOutcome<EnvselCatalogValue>>
  /** Read the current session's folded selection. */
  getSelection: (sessionId: SessionId) => Promise<EnvselRemoteOutcome<EnvselGetValue>>
  /** Assign one slot by entry address ('' clears the slot). */
  setSelection: (sessionId: SessionId, slot: EnvSlot, address: string) => Promise<EnvselRemoteOutcome<EnvselGetValue>>
  /** Remember one host path in the machine-local cache and return the catalog. */
  pinPath: (path: string) => Promise<EnvselRemoteOutcome<EnvselCatalogValue>>
  /** Forget one remembered path by entry address or original path. */
  unpinPath: (address: string) => Promise<EnvselRemoteOutcome<EnvselCatalogValue>>
}

/** Full component props composed by the header utilities slot. */
export type EnvselHeaderButtonProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<EnvselHeaderButtonInjected>

/** Canonical slot display order. */
const SLOT_ORDER: readonly EnvSlot[] = ['python', 'r', 'cli']

/** Slot label locale keys, keyed by slot. */
const SLOT_LABEL_KEYS: Record<EnvSlot, EnvselLocaleKey> = {
  python: 'slotPython',
  r: 'slotR',
  cli: 'slotCli',
}

/** Whether an entry can serve a slot (its language must be present). */
function slotCompatible(slot: EnvSlot, entry: EnvEntry): boolean {
  if (slot === 'python') return entry.python !== null
  if (slot === 'r') return entry.rscript !== null
  return true
}

/** Stable entry address, mirroring the host's `entryAddress`. */
function entryAddress(entry: EnvEntry): string {
  return entry.kind === 'wsl'
    ? `wsl:${String(entry.distro)}:${entry.name}`
    : `${entry.kind}:${entry.name}`
}

/** Compact kind/distro badge for one entry. */
function kindLabel(entry: EnvEntry, t: EnvselHeaderButtonProps['t']): string {
  if (entry.kind === 'wsl') return `${t('kindWsl')} · ${String(entry.distro)}`
  if (entry.kind === 'custom') return t('kindCustom')
  return entry.kind === 'r' ? t('kindR') : t('kindConda')
}

/** Localized human message for one business failure code. */
function messageOf(code: string, t: EnvselHeaderButtonProps['t']): string {
  switch (code) {
    case 'session-not-found': return t('errorSession')
    case 'entry-not-found': return t('errorEntry')
    case 'incompatible': return t('errorIncompatible')
    case 'unknown-slot': return t('errorUnknownSlot')
    case 'invalid-path': return t('errorInvalidPath')
    case 'not-found': return t('errorNotFound')
    case 'no-interpreter': return t('errorNoInterpreter')
    default: return t('errorTransport')
  }
}

/**
 * Render this session's environment selector.
 * @param props - runtime slot currency, the translator, and the Remote face.
 * @returns the trigger button and its per-language panel.
 */
export function EnvselHeaderButton({
  sessionId, t, listCatalog, getSelection, setSelection, pinPath, unpinPath,
}: EnvselHeaderButtonProps) {
  const [selection, setSelectionState] = useState<EnvSelection | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [catalog, setCatalog] = useState<EnvselCatalogValue | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [busySlot, setBusySlot] = useState<EnvSlot | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [draftPath, setDraftPath] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Seed the summary from the folded session selection; a failed read stays
  // retryable from the panel.
  useEffect(() => {
    let current = true
    void getSelection(sessionId).then((result) => {
      if (!current) return
      if (result.ok) {
        setSelectionState(result.value.selection)
        setLoadError(null)
      } else {
        setLoadError(messageOf(result.error.code, t))
      }
    })
    return () => { current = false }
  }, [getSelection, sessionId, t])

  // Close on outside pointerdown and Escape, like the other header popovers.
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => { document.removeEventListener('pointerdown', closeOutside) }
  }, [open])

  const loadCatalog = (): void => {
    if (catalogLoading) return
    setCatalogLoading(true)
    setCatalogError(null)
    void listCatalog().then((result) => {
      setCatalogLoading(false)
      if (result.ok) setCatalog(result.value)
      else setCatalogError(messageOf(result.error.code, t))
    })
  }

  const reloadSelection = (): void => {
    setLoadError(null)
    void getSelection(sessionId).then((result) => {
      if (result.ok) setSelectionState(result.value.selection)
      else setLoadError(messageOf(result.error.code, t))
    })
  }

  const onToggle = (): void => {
    const next = !open
    setOpen(next)
    if (next && catalog === null) loadCatalog()
  }

  const submitPin = (): void => {
    const path = draftPath.trim()
    if (path.length === 0 || pinBusy) return
    setPinBusy(true)
    setActionError(null)
    void pinPath(path).then((result) => {
      setPinBusy(false)
      if (result.ok) {
        setCatalog(result.value)
        setDraftPath('')
      } else {
        setActionError(messageOf(result.error.code, t))
      }
    })
  }

  const forget = (address: string): void => {
    if (pinBusy) return
    setPinBusy(true)
    setActionError(null)
    void unpinPath(address).then((result) => {
      setPinBusy(false)
      if (result.ok) setCatalog(result.value)
      else setActionError(messageOf(result.error.code, t))
    })
  }

  const choose = (slot: EnvSlot, address: string): void => {
    if (busySlot !== null) return
    setBusySlot(slot)
    setActionError(null)
    void setSelection(sessionId, slot, address).then((result) => {
      setBusySlot(null)
      if (result.ok) setSelectionState(result.value.selection)
      else setActionError(messageOf(result.error.code, t))
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    setOpen(false)
    triggerRef.current?.focus()
  }

  const summary = useMemo(() => {
    if (selection === null) return t('summaryNone')
    const parts = SLOT_ORDER
      .filter(slot => selection[slot] !== undefined)
      .map(slot => `${t(SLOT_LABEL_KEYS[slot])}: ${selection[slot]!.name}`)
    return parts.length === 0 ? t('summaryNone') : parts.join(' · ')
  }, [selection, t])

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={css.trigger}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className={css.triggerLabel}>{t('trigger')}</span>
        <span className={loadError === null ? css.summary : css.summaryError} title={loadError ?? summary}>
          {loadError ?? summary}
        </span>
        <IconChevronDownOutline14 className={open ? css.chevronOpen : undefined} aria-hidden="true" />
      </button>
      {open ? (
        <div className={css.panel} role="group" aria-label={t('panelAria')}>
          {loadError !== null ? (
            <div className={css.banner} role="alert">
              <span>{loadError}</span>
              <button type="button" className={css.retry} onClick={reloadSelection}>{t('retry')}</button>
            </div>
          ) : null}
          {actionError !== null ? <p className={css.banner} role="alert">{t('actionError', { message: actionError })}</p> : null}
          {catalogLoading ? <p className={css.status}>{t('catalogLoading')}</p> : null}
          {catalogError !== null ? <p className={css.status} role="alert">{catalogError}</p> : null}
          <form
            className={css.addForm}
            onSubmit={(event) => {
              event.preventDefault()
              submitPin()
            }}
          >
            <label className={css.addLabel} htmlFor="envsel-add-path">{t('addPathLabel')}</label>
            <div className={css.addRow}>
              <input
                id="envsel-add-path"
                className={css.addInput}
                type="text"
                value={draftPath}
                placeholder={t('addPathPlaceholder')}
                aria-label={t('addPathAria')}
                disabled={pinBusy}
                onChange={(event) => setDraftPath(event.target.value)}
              />
              <button type="submit" className={css.addSubmit} disabled={pinBusy || draftPath.trim().length === 0}>
                {t('addPathSubmit')}
              </button>
            </div>
          </form>
          {SLOT_ORDER.map((slot) => {
            const current = selection?.[slot]
            return (
              <section key={slot} className={css.slot} data-slot={slot}>
                <div className={css.slotHeading}>
                  <h4 className={css.slotTitle}>{t(SLOT_LABEL_KEYS[slot])}</h4>
                  {current !== undefined ? (
                    <button
                      type="button"
                      className={css.clear}
                      aria-label={t('clearSlotAria', { slot: t(SLOT_LABEL_KEYS[slot]) })}
                      disabled={busySlot === slot}
                      onClick={() => choose(slot, '')}
                    >
                      <IconCloseFill14 aria-hidden="true" />
                      <span>{t('clear')} {current.name}</span>
                    </button>
                  ) : null}
                </div>
                {current === undefined && catalog !== null ? (
                  <p className={css.emptySlot}>{t('emptySlot')}</p>
                ) : null}
                {catalog !== null
                  ? (
                    <ul className={css.entries}>
                      {catalog.entries.filter(entry => slotCompatible(slot, entry)).map((entry) => {
                        const address = entryAddress(entry)
                        const selected = current !== undefined && entryAddress(current) === address
                        return (
                          <li key={address} className={css.entryRow}>
                            <button
                              type="button"
                              className={selected ? `${css.entry} ${css.entrySelected}` : css.entry}
                              aria-pressed={selected}
                              aria-label={t('entryAria', { slot: t(SLOT_LABEL_KEYS[slot]), name: entry.name })}
                              disabled={busySlot === slot}
                              onClick={() => choose(slot, address)}
                            >
                              <IconCheckOutline14 className={selected ? css.check : css.checkHidden} aria-hidden="true" />
                              <span className={css.entryName}>{entry.name}</span>
                              <span className={css.entryKind}>{kindLabel(entry, t)}</span>
                            </button>
                            {entry.kind === 'custom' && slot === 'cli' ? (
                              <button
                                type="button"
                                className={css.unpin}
                                aria-label={t('unpinAria', { name: entry.name })}
                                disabled={pinBusy}
                                onClick={() => forget(address)}
                              >
                                {t('clear')}
                              </button>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  )
                  : null}
              </section>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
