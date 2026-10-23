import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { hayWorkersConSesiones } from '../lib/webpanel/pairing.js'
import { subBotsPermitidos } from '../lib/process-isolation.js'

test('supervisor: los workers arrancan si hay sub-bots aunque no haya principal', () => {
  // Sin principal y sin sub-bots: los workers esperan (no tiene sentido
  // levantar 150 sub-bots mientras se empareja el principal).
  assert.equal(subBotsPermitidos({ principalVinculado: false, sesionRegistrada: false }), false)
  // Con al menos un sub-bot vinculado, los workers arrancan igual.
  assert.equal(subBotsPermitidos({ principalVinculado: false, sesionRegistrada: false, haySubBots: true }), true)
  // Con el principal vinculado, también.
  assert.equal(subBotsPermitidos({ principalVinculado: true }), true)
  assert.equal(subBotsPermitidos({ sesionRegistrada: true }), true)
})

test('pairing: los sub-bots no dependen del principal si los workers viven', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-panel-workers-'))
  const carpeta = path.join(root, 'storage', 'process-status')
  fs.mkdirSync(carpeta, { recursive: true })
  const archivo = path.join(carpeta, 'test-worker-1.json')
  try {
    assert.equal(hayWorkersConSesiones(root), false)

    fs.writeFileSync(archivo, JSON.stringify({
      workerId: 'test-worker-1',
      pid: process.pid,
      updatedAt: Date.now(),
      sessions: [{ folder: '5215500000099', number: '5215500000099', connected: true }],
    }))

    // Con workers vivos se puede vincular aunque el principal no esté.
    assert.equal(hayWorkersConSesiones(root), true)

    // Un worker sin sesiones no cuenta.
    fs.writeFileSync(archivo, JSON.stringify({
      workerId: 'test-worker-1',
      pid: process.pid,
      updatedAt: Date.now(),
      sessions: [],
    }))
    assert.equal(hayWorkersConSesiones(root), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
