import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  ARCHIVO_REENLACE_PENDIENTE,
  limpiarCredencialesSubBot
} from '../lib/subbot-recovery.js'

test('cleans relink session credentials and preserves sub-bot configuration', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'painbot-relink-'))
  const session = path.join(root, '5211111111111')
  fs.mkdirSync(path.join(session, 'app-state-sync-key'), { recursive: true })
  fs.writeFileSync(path.join(session, 'creds.json'), '{}')
  fs.writeFileSync(path.join(session, 'config.json'), '{}')
  fs.writeFileSync(path.join(session, 'staff.json'), '{}')
  fs.writeFileSync(path.join(session, 'soporte.json'), '{}')
  fs.writeFileSync(path.join(session, ARCHIVO_REENLACE_PENDIENTE), '{}')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  assert.equal(limpiarCredencialesSubBot(session, root), true)
  assert.deepEqual(fs.readdirSync(session).sort(), [
    ARCHIVO_REENLACE_PENDIENTE,
    'config.json',
    'soporte.json',
    'staff.json'
  ].sort())
})

test('does not clean session paths outside the sub-bot root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'painbot-relink-root-'))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'painbot-relink-outside-'))
  fs.writeFileSync(path.join(outside, 'creds.json'), '{}')
  try {
    assert.throws(
      () => limpiarCredencialesSubBot(outside, root),
      /ruta de sesión del sub-bot no es válida/
    )
    assert.equal(fs.existsSync(path.join(outside, 'creds.json')), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  }
})
