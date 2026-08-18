import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { defaultStandaloneRRoots, isWindowsHost, joinPath, prefixFromRscript } from '../src/index.ts'

describe('discover helpers', () => {
  it('prefixFromRscript strips a Windows python path', () => {
    assert.equal(prefixFromRscript('C:\\Users\\me\\miniconda3\\python.exe'), 'C:\\Users\\me\\miniconda3')
  })

  it('prefixFromRscript strips a POSIX Rscript path', () => {
    assert.equal(prefixFromRscript('/opt/R/4.5.1/bin/Rscript'), '/opt/R/4.5.1')
  })

  it('defaultStandaloneRRoots covers the Windows Program Files roots', () => {
    assert.ok(defaultStandaloneRRoots('win32').includes('C:\\Program Files\\R'))
    assert.ok(defaultStandaloneRRoots('win32').includes('C:\\Program Files (x86)\\R'))
  })

  it('defaultStandaloneRRoots covers macOS framework and homebrew roots', () => {
    const roots = defaultStandaloneRRoots('darwin')
    assert.ok(roots.includes('/Library/Frameworks/R.framework/Versions'))
    assert.ok(roots.includes('/opt/homebrew/opt/r'))
  })

  it('defaultStandaloneRRoots covers Linux roots', () => {
    assert.deepEqual(defaultStandaloneRRoots('linux'), ['/opt/R', '/usr/local', '/usr'])
  })

  it('joinPath uses the host separator', () => {
    assert.equal(joinPath('/a/b', 'c', 'linux'), '/a/b/c')
    assert.equal(joinPath('C:\\a\\b', 'c', 'win32'), 'C:\\a\\b\\c')
  })

  it('isWindowsHost reads the platform', () => {
    assert.equal(isWindowsHost('win32'), true)
    assert.equal(isWindowsHost('darwin'), false)
    assert.equal(isWindowsHost('linux'), false)
  })
})
