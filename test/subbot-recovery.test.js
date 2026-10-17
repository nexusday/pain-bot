import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  ARCHIVO_REENLACE_PENDIENTE,
  DIR_AJUSTES_SESION,
  conservarAjustesSesion,
  limpiarCredencialesSubBot,
  listarRequierenVincular,
  necesitaRevinculacion,
  olvidarAjustesSesion,
  purgarSesionReenlace,
  purgarSesionesReenlace,
  restaurarAjustesSesion,
  tieneAjustesGuardados
} from '../lib/subbot-recovery.js'

function crearSesionMarcada(root, nombre, { conAjustes = true } = {}) {
  const session = path.join(root, nombre)
  fs.mkdirSync(path.join(session, 'app-state-sync-key'), { recursive: true })
  fs.writeFileSync(path.join(session, 'creds.json'), '{}')
  fs.writeFileSync(path.join(session, ARCHIVO_REENLACE_PENDIENTE), JSON.stringify({ reason: 401 }))
  if (conAjustes) {
    fs.writeFileSync(path.join(session, 'config.json'), JSON.stringify({ name: `bot ${nombre}` }))
    fs.writeFileSync(path.join(session, 'staff.json'), '[]')
    fs.writeFileSync(path.join(session, 'soporte.json'), '{}')
  }
  return session
}

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

test('archives a rejected session, keeps its settings and restores them on relink', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'painbot-purge-'))
  const session = crearSesionMarcada(root, '5211111111111')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  assert.equal(purgarSesionReenlace(session, root), true)
  // La carpeta se borra; solo queda el registro liviano de ajustes.
  assert.equal(fs.existsSync(session), false)
  assert.equal(tieneAjustesGuardados(root, '5211111111111'), true)
  const registro = path.join(root, DIR_AJUSTES_SESION, '5211111111111')
  assert.equal(fs.existsSync(path.join(registro, 'config.json')), true)
  assert.equal(fs.existsSync(path.join(registro, 'staff.json')), true)
  assert.equal(fs.existsSync(path.join(registro, 'soporte.json')), true)

  // Sigue figurando como pendiente de revincular aunque no exista la carpeta.
  assert.deepEqual(listarRequierenVincular(root), ['5211111111111'])
  assert.equal(necesitaRevinculacion(root, '5211111111111'), true)

  // Al volver a vincular, restaura los ajustes en la carpeta nueva.
  const restaurado = restaurarAjustesSesion(session, root)
  assert.equal(restaurado, true)
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(session, 'config.json'), 'utf8')),
    { name: 'bot 5211111111111' }
  )
  assert.equal(fs.existsSync(path.join(session, 'creds.json')), false)

  // Una vez vinculada y olvidada, deja de aparecer como pendiente.
  olvidarAjustesSesion(session, root)
  assert.equal(necesitaRevinculacion(root, '5211111111111'), false)
  assert.deepEqual(listarRequierenVincular(root), [])
})

test('restoring does not overwrite settings already recreated in the session', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'painbot-restore-'))
  const session = crearSesionMarcada(root, '5219999999999')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  conservarAjustesSesion(session, root)
  fs.rmSync(session, { recursive: true, force: true })
  fs.mkdirSync(session, { recursive: true })
  fs.writeFileSync(path.join(session, 'config.json'), JSON.stringify({ name: 'nuevo' }))

  assert.equal(restaurarAjustesSesion(session, root), true)
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(session, 'config.json'), 'utf8')),
    { name: 'nuevo' }
  )
})

test('sweeps and archives every session marked for relink', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'painbot-sweep-'))
  crearSesionMarcada(root, '5211111111111')
  crearSesionMarcada(root, '5212222222222')
  // Una sesión sana (con creds y sin marca) no se toca.
  const sana = path.join(root, '5213333333333')
  fs.mkdirSync(sana, { recursive: true })
  fs.writeFileSync(path.join(sana, 'creds.json'), '{}')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const purgadas = purgarSesionesReenlace(root).sort()
  assert.deepEqual(purgadas, ['5211111111111', '5212222222222'])
  assert.equal(fs.existsSync(path.join(root, '5211111111111')), false)
  assert.equal(fs.existsSync(path.join(root, '5212222222222')), false)
  assert.equal(fs.existsSync(sana), true)
  assert.deepEqual(
    listarRequierenVincular(root).sort(),
    ['5211111111111', '5212222222222']
  )
})

test('archives a marked session without config yet still keeps it pending', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'painbot-nocfg-'))
  const session = crearSesionMarcada(root, '5218888888888', { conAjustes: false })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  assert.equal(purgarSesionReenlace(session, root), true)
  assert.equal(fs.existsSync(session), false)
  assert.equal(tieneAjustesGuardados(root, '5218888888888'), true)
  assert.deepEqual(listarRequierenVincular(root), ['5218888888888'])
})

test('never cleans or archives the settings registry itself', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'painbot-prefs-'))
  const registro = path.join(root, DIR_AJUSTES_SESION)
  fs.mkdirSync(registro, { recursive: true })
  fs.writeFileSync(path.join(registro, 'README'), 'x')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  assert.throws(() => limpiarCredencialesSubBot(registro, root))
  purgarSesionesReenlace(root)
  assert.equal(fs.existsSync(registro), true)
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
