import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseStateDocument, serializeStateDocument, STATE_FILE_VERSION } from '../src/state.ts'

describe('state document', () => {
  it('roundtrips a selection map', () => {
    const selection = {
      'session-1': {
        python: {
          kind: 'conda',
          name: 'base',
          prefix: '/opt/miniconda3',
          python: '/opt/miniconda3/bin/python',
          rscript: null,
        },
      },
    }
    const parsed = parseStateDocument(serializeStateDocument(selection))
    assert.equal(parsed['session-1']?.python?.name, 'base')
  })

  it('returns an empty map for invalid JSON', () => {
    assert.deepEqual(parseStateDocument('not json'), {})
  })

  it('returns an empty map for a non-object document', () => {
    assert.deepEqual(parseStateDocument('[1, 2]'), {})
  })

  it('returns an empty map for a version mismatch', () => {
    const raw = serializeStateDocument({ 'session-1': {} })
    const badVersion = raw.replace(String(STATE_FILE_VERSION), String(STATE_FILE_VERSION + 1))
    assert.deepEqual(parseStateDocument(badVersion), {})
  })

  it('roundtrips an empty map', () => {
    assert.deepEqual(parseStateDocument(serializeStateDocument({})), {})
  })
})
