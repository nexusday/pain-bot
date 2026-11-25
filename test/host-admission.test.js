import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  adquirirPermisoCompartido,
  ejecutarConRateLimitCompartido,
} from '../lib/host-admission.js'

function carpetaTemporal() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pain-admission-'))
}

test('la admisión compartida serializa las operaciones entre llamadas', async () => {
  const root = carpetaTemporal()
  let activas = 0
  let maximo = 0
  try {
    await Promise.all(Array.from({ length: 4 }, () =>
      ejecutarConRateLimitCompartido(
        'test',
        async () => {
          activas++
          maximo = Math.max(maximo, activas)
          await new Promise((resolve) => setTimeout(resolve, 15))
          activas--
        },
        { rootDir: root, intervalMs: 0 }
      )
    ))
    assert.equal(maximo, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('el rate limit compartido separa los comienzos de cada operación', async () => {
  const root = carpetaTemporal()
  const comienzos = []
  try {
    await Promise.all(Array.from({ length: 3 }, () =>
      ejecutarConRateLimitCompartido(
        'rate',
        async () => {
          comienzos.push(Date.now())
        },
        { rootDir: root, intervalMs: 40 }
      )
    ))
    comienzos.sort((a, b) => a - b)
    assert.equal(comienzos.length, 3)
    assert.ok(comienzos[1] - comienzos[0] >= 35)
    assert.ok(comienzos[2] - comienzos[1] >= 35)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('una espera cancelada no conserva el slot', async () => {
  const root = carpetaTemporal()
  const liberar = await adquirirPermisoCompartido('cancel', { rootDir: root })
  let cancelado = false
  try {
    const esperando = adquirirPermisoCompartido('cancel', {
      rootDir: root,
      cancelado: () => cancelado,
    })
    setTimeout(() => { cancelado = true }, 15)
    assert.equal(await esperando, null)
    liberar()

    const siguiente = await adquirirPermisoCompartido('cancel', { rootDir: root })
    assert.equal(typeof siguiente, 'function')
    siguiente()
  } finally {
    liberar()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
