import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseEnvLine, slotCompatible } from '../src/index.ts'
import type { EnvEntry } from '../src/types.ts'

describe('parseEnvLine', () => {
  it('empty input shows the current selection', () => {
    assert.equal(parseEnvLine('').kind, 'show')
  })

  it('help', () => {
    assert.equal(parseEnvLine('help').kind, 'help')
  })

  it('clear', () => {
    assert.equal(parseEnvLine('clear').kind, 'clear')
  })

  it('add captures the whole rest as a path', () => {
    const action = parseEnvLine('add C:\\Users\\me\\miniconda3\\python.exe')
    assert.equal(action.kind, 'add')
    if (action.kind === 'add') assert.equal(action.path, 'C:\\Users\\me\\miniconda3\\python.exe')
  })

  it('assign parses slot=value pairs', () => {
    const action = parseEnvLine('python=base r=R-4.5.1')
    assert.equal(action.kind, 'assign')
    if (action.kind === 'assign') {
      assert.deepEqual(action.assignments, [
        { slot: 'python', value: 'base' },
        { slot: 'r', value: 'R-4.5.1' },
      ])
    }
  })

  it('rejects an unknown slot', () => {
    assert.equal(parseEnvLine('foo=x').kind, 'error')
  })

  it('rejects a bare token', () => {
    assert.equal(parseEnvLine('nonsense').kind, 'error')
  })

  it('empty assignment clears a slot', () => {
    const action = parseEnvLine('python=')
    assert.equal(action.kind, 'assign')
    if (action.kind === 'assign') assert.equal(action.assignments[0]?.value, '')
  })
})

describe('slotCompatible', () => {
  const condaPython: EnvEntry = {
    kind: 'conda', name: 'base', prefix: '/opt/miniconda3',
    python: '/opt/miniconda3/bin/python', rscript: null,
  }
  const rOnly: EnvEntry = {
    kind: 'r', name: 'R-4.5.1', prefix: '/opt/R/4.5.1',
    python: null, rscript: '/opt/R/4.5.1/bin/Rscript',
  }

  it('python slot needs a python interpreter', () => {
    assert.equal(slotCompatible('python', condaPython), true)
    assert.equal(slotCompatible('python', rOnly), false)
  })

  it('r slot needs an Rscript interpreter', () => {
    assert.equal(slotCompatible('r', rOnly), true)
    assert.equal(slotCompatible('r', condaPython), false)
  })

  it('cli slot accepts any entry', () => {
    assert.equal(slotCompatible('cli', rOnly), true)
    assert.equal(slotCompatible('cli', condaPython), true)
  })
})
