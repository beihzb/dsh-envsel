/**
 * Selection resolution and runtime-context rendering.
 *
 * `resolveSelection` is the single place that decides which environment a
 * session runs in, and it is what makes a delegated subagent inherit the
 * environment its parent chose (a DSH subagent runs in its own session, whose
 * header names the session that delegated to it). These tests pin the
 * resolution order, the ancestor walk, and the text that reaches the model.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { resolveSelection, selectionContext } from '../src/index.ts'
import type { EnvEntry, EnvSelection } from '../src/types.ts'

/** One conda entry with an absolute python invocation. */
function conda(name: string): EnvEntry {
  const prefix = `C:\\Users\\analyst\\.conda\\envs\\${name}`
  const python = `${prefix}\\python.exe`
  return {
    kind: 'conda',
    name,
    prefix,
    python,
    rscript: null,
    pythonCommand: python,
  }
}

/** One standalone R entry with an absolute Rscript invocation. */
function standaloneR(name: string): EnvEntry {
  const rscript = `C:\\Program Files\\R\\${name}\\bin\\Rscript.exe`
  return {
    kind: 'r',
    name,
    prefix: `C:\\Program Files\\R\\${name}`,
    python: null,
    rscript,
    rscriptCommand: rscript,
  }
}

/** A selection map over a `child -> parent` lineage. */
function lineage(edges: Record<string, string>): (id: SessionId) => SessionId | undefined {
  return (id) => {
    const parent = edges[String(id)]
    return parent === undefined ? undefined : SessionId(parent)
  }
}

describe('resolveSelection', () => {
  it('prefers the session\'s own selection over any ancestor\'s', () => {
    const selections = new Map<string, EnvSelection>([
      ['parent', { python: conda('scRNAv2') }],
      ['child', { python: conda('evo') }],
    ])
    const resolved = resolveSelection(SessionId('child'), selections, lineage({ child: 'parent' }))
    assert.equal(resolved.python?.name, 'evo')
  })

  it('inherits the delegating session\'s selection when it has none of its own', () => {
    const selections = new Map<string, EnvSelection>([
      ['session-parent', { python: conda('scRNAv2'), r: standaloneR('R-4.5.1') }],
    ])
    const resolved = resolveSelection(
      SessionId('subagent-child'),
      selections,
      lineage({ 'subagent-child': 'session-parent' }),
    )
    assert.equal(resolved.python?.name, 'scRNAv2')
    assert.equal(resolved.r?.name, 'R-4.5.1')
  })

  it('walks past intermediate sessions that selected nothing', () => {
    const selections = new Map<string, EnvSelection>([
      ['root', { python: conda('bioreport') }],
    ])
    const resolved = resolveSelection(
      SessionId('grandchild'),
      selections,
      lineage({ grandchild: 'child', child: 'root' }),
    )
    assert.equal(resolved.python?.name, 'bioreport')
  })

  it('takes the nearest ancestor that selected anything', () => {
    const selections = new Map<string, EnvSelection>([
      ['root', { python: conda('scRNAv2') }],
      ['child', { python: conda('image') }],
    ])
    const resolved = resolveSelection(
      SessionId('grandchild'),
      selections,
      lineage({ grandchild: 'child', child: 'root' }),
    )
    assert.equal(resolved.python?.name, 'image')
  })

  it('returns an empty selection when nothing in the lineage selected anything', () => {
    const resolved = resolveSelection(
      SessionId('child'),
      new Map<string, EnvSelection>(),
      lineage({ child: 'parent' }),
    )
    assert.deepEqual(resolved, {})
  })

  it('returns an empty selection for a session with no lineage entry', () => {
    const resolved = resolveSelection(SessionId('orphan'), new Map<string, EnvSelection>(), lineage({}))
    assert.deepEqual(resolved, {})
  })

  it('stops at maxHops instead of reaching a selection further up', () => {
    // A four-hop chain with only the root selected: a two-hop bound must miss it.
    const selections = new Map<string, EnvSelection>([['root', { python: conda('evo') }]])
    const edges = { a: 'b', b: 'c', c: 'root' }
    assert.equal(resolveSelection(SessionId('a'), selections, lineage(edges), 3).python?.name, 'evo')
    assert.deepEqual(resolveSelection(SessionId('a'), selections, lineage(edges), 2), {})
  })

  it('terminates on a lineage cycle rather than walking forever', () => {
    const selections = new Map<string, EnvSelection>([['outside', { python: conda('evo') }]])
    const resolved = resolveSelection(
      SessionId('a'),
      selections,
      lineage({ a: 'b', b: 'a' }),
      4,
    )
    assert.deepEqual(resolved, {})
  })
})

describe('selectionContext', () => {
  it('contributes nothing when no environment is selected', () => {
    // An unselected session (and every subagent without an inherited
    // selection) must add no runtime-context block at all, so the durable
    // snapshot never churns for sessions that chose nothing.
    assert.equal(selectionContext({}), '')
  })

  it('states the selected python environment and its absolute invocation', () => {
    const text = selectionContext({ python: conda('scRNAv2') })
    assert.match(text, /Session Python env \(user-selected\): scRNAv2 \(conda\)\./)
    assert.match(text, /C:\\Users\\analyst\\\.conda\\envs\\scRNAv2\\python\.exe/)
    assert.match(text, /for all Python work in this session/)
  })

  it('states the selected R environment and its absolute invocation', () => {
    const text = selectionContext({ r: standaloneR('R-4.5.1') })
    assert.match(text, /Session R env \(user-selected\): R-4\.5\.1 \(r\)\./)
    assert.match(text, /Rscript\.exe/)
  })

  it('renders every selected slot in one block', () => {
    const text = selectionContext({ python: conda('scRNAv2'), r: standaloneR('R-4.5.1'), cli: conda('scRNAv2') })
    assert.match(text, /Session Python env/)
    assert.match(text, /Session R env/)
    assert.match(text, /Session CLI env/)
  })

  it('tells the model how to prepend a CLI prefix for the host shell', () => {
    const text = selectionContext({ cli: conda('scRNAv2') })
    assert.match(text, /CLI env \(user-selected\): scRNAv2 \(conda\)/)
    // The guidance follows the host shell family, so the assertion does too.
    assert.match(text, process.platform === 'win32' ? /\$env:PATH = "/u : /export PATH="/u)
  })
})
