import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  ARCHIVO_PAIRING,
  limpiarCredencialesSubBot,
  limpiarEmparejamiento,
  limpiarEmparejamientos,
  marcarEmparejamiento,
  sesionEnEmparejamiento,
} from '../lib/subbot-recovery.js'
import { contarSesiones, listarSesiones } from '../lib/webpanel/session-ops.js'

function crearRaiz() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pain-webpanel-sessions-'))
}

test('webpanel: una sesión con .pairing queda bloqueada y marcada como pairing', () => {
  const root = crearRaiz()
  const phone = '5215512345678'
  const ruta = path.join(root, phone)
  try {
    fs.mkdirSync(ruta, { recursive: true })
    fs.writeFileSync(path.join(ruta, 'creds.json'), JSON.stringify({ registered: true }))
    fs.writeFileSync(path.join(ruta, 'config.json'), JSON.stringify({ prefijo: '.' }))
    fs.writeFileSync(path.join(ruta, '.needs-relink'), '1')
    marcarEmparejamiento(ruta, { pairingId: 'test', source: 'webpanel' })

    assert.equal(sesionEnEmparejamiento(ruta), true)
    const sesiones = listarSesiones(root)
    assert.equal(sesiones.length, 1)
    assert.equal(sesiones[0].folder, phone)
    assert.equal(sesiones[0].status, 'pairing')
    assert.equal(sesiones[0].pairing, true)
    assert.equal(sesiones[0].needsRelink, false)
    assert.equal(contarSesiones(root).pairing, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('webpanel: limpiar credenciales respeta .pairing y los ajustes', () => {
  const root = crearRaiz()
  const phone = '5215512345678'
  const ruta = path.join(root, phone)
  try {
    fs.mkdirSync(ruta, { recursive: true })
    fs.writeFileSync(path.join(ruta, 'creds.json'), JSON.stringify({ registered: false }))
    fs.writeFileSync(path.join(ruta, 'config.json'), JSON.stringify({ prefijo: '#' }))
    fs.writeFileSync(path.join(ruta, 'staff.json'), '[]')
    fs.writeFileSync(path.join(ruta, 'soporte.json'), '{}')
    marcarEmparejamiento(ruta, { pairingId: 'test' })

    assert.equal(limpiarCredencialesSubBot(ruta, root), true)
    assert.equal(fs.existsSync(path.join(ruta, ARCHIVO_PAIRING)), true)
    assert.equal(fs.existsSync(path.join(ruta, 'creds.json')), false)
    assert.equal(fs.existsSync(path.join(ruta, 'config.json')), true)
    assert.equal(fs.existsSync(path.join(ruta, 'staff.json')), true)
    assert.equal(fs.existsSync(path.join(ruta, 'soporte.json')), true)
    assert.equal(sesionEnEmparejamiento(ruta), true)

    limpiarEmparejamiento(ruta)
    assert.equal(sesionEnEmparejamiento(ruta), false)
    assert.equal(listarSesiones(root)[0].status, 'unknown')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('webpanel: sesiones archivadas en _prefs aparecen para re-vincular', () => {
  const root = crearRaiz()
  try {
    fs.mkdirSync(path.join(root, '_prefs', '51999999999'), { recursive: true })
    fs.writeFileSync(path.join(root, '_prefs', '51999999999', 'config.json'), '{}')
    const sesiones = listarSesiones(root)
    assert.equal(sesiones.length, 1)
    assert.equal(sesiones[0].folder, '51999999999')
    assert.equal(sesiones[0].status, 'relink')
    assert.equal(sesiones[0].archived, true)
    assert.equal(sesiones[0].hasSettings, true)
    assert.equal(contarSesiones(root).relink, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('webpanel: limpia marcas .pairing huérfanas al arrancar', () => {
  const root = crearRaiz()
  try {
    const uno = path.join(root, '5215511111111')
    const dos = path.join(root, '5215522222222')
    const libre = path.join(root, '5215533333333')
    for (const ruta of [uno, dos, libre]) {
      fs.mkdirSync(ruta, { recursive: true })
      fs.writeFileSync(path.join(ruta, 'creds.json'), JSON.stringify({ registered: true }))
    }
    marcarEmparejamiento(uno)
    marcarEmparejamiento(dos)

    assert.equal(listarSesiones(root).filter((sesion) => sesion.status === 'pairing').length, 2)
    assert.equal(limpiarEmparejamientos(root), 2)
    assert.equal(fs.existsSync(path.join(uno, ARCHIVO_PAIRING)), false)
    assert.equal(fs.existsSync(path.join(dos, ARCHIVO_PAIRING)), false)
    assert.equal(listarSesiones(root).filter((sesion) => sesion.status === 'pairing').length, 0)
    assert.equal(limpiarEmparejamientos(root), 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
