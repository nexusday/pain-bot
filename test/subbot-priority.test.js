import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  esSesionPremium,
  ordenarSesionesPorPrioridad,
  prioridadDeSesion,
} from '../lib/subbot-priority.js'
import { contarGruposActivos } from '../lib/webpanel/runtime-stats.js'

function crearRaiz(sesiones) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'painbot-priority-'))
  for (const [folder, premium] of Object.entries(sesiones)) {
    const dir = path.join(root, folder)
    fs.mkdirSync(dir, { recursive: true })
    if (premium) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(premium))
  }
  return root
}

test('detecta premium vigente, infinito y caducado', () => {
  const ahora = Date.now()
  const root = crearRaiz({
    '111': { premium: { expiresAt: ahora + 60_000 } },
    '222': { premium: { adminInfinite: true } },
    '333': { premium: { expiresAt: ahora - 1_000 } },
    '444': {},
  })
  try {
    assert.equal(esSesionPremium(root, '111', ahora), true)
    assert.equal(esSesionPremium(root, '222', ahora), true)
    assert.equal(esSesionPremium(root, '333', ahora), false)
    assert.equal(esSesionPremium(root, '444', ahora), false)
    assert.equal(esSesionPremium(root, '999', ahora), false)
    assert.equal(esSesionPremium(root, '../fuera', ahora), false)
    assert.equal(prioridadDeSesion(root, '111'), 1)
    assert.equal(prioridadDeSesion(root, '444'), 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('el arranque ordena premium primero sin alterar el orden interno', () => {
  const ahora = Date.now()
  const root = crearRaiz({
    a: null,
    b: { premium: { expiresAt: ahora + 60_000 } },
    c: null,
    d: { premium: { adminInfinite: true } },
  })
  try {
    assert.deepEqual(ordenarSesionesPorPrioridad(root, ['a', 'b', 'c', 'd'], ahora), ['b', 'd', 'a', 'c'])
    assert.deepEqual(ordenarSesionesPorPrioridad(root, [], ahora), [])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('grupos activos se cuentan desde la DB compartida, no solo del proceso', () => {
  const datos = {
    botGroups: {
      '120@g.us': true,
      '121@g.us': false,
      '122@g.us': true,
    },
    chats: {
      '120@g.us': {},
      '121@g.us': {},
      '123@g.us': {},
      '124@s.whatsapp.net': {},
    },
  }
  // 120 (chat + activo), 122 (solo toggle activo), 123 (chat); 121 desactivado.
  assert.equal(contarGruposActivos(datos), 3)
  assert.equal(contarGruposActivos({ botGroups: {}, chats: {} }), 0)
})
