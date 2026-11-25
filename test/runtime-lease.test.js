import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { acquireRuntimeLease } from '../lib/runtime-lease.js'

function crearRaiz() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'pain-lease-'))
  fs.mkdirSync(path.join(raiz, 'runtime-pids'), { recursive: true })
  return raiz
}

function escribirCandado(raiz, kind, { pid, edadMs = 0 }) {
  const ruta = path.join(raiz, 'runtime-pids', `${kind}.lock`)
  fs.writeFileSync(ruta, JSON.stringify({
    pid,
    host: os.hostname(),
    kind,
    startedAt: Date.now() - edadMs,
  }))
  if (edadMs > 0) {
    const viejo = new Date(Date.now() - edadMs)
    fs.utimesSync(ruta, viejo, viejo)
  }
  return ruta
}

test('un candado sin latido se retira aunque su PID siga existiendo', () => {
  const raiz = crearRaiz()
  try {
    // PID 128 suele existir en el contenedor, pero ya no es el bot. Sin
    // latido reciente, el candado está muerto y debe poder tomarse.
    const ruta = escribirCandado(raiz, 'supervisor', { pid: 128, edadMs: 10 * 60_000 })
    const release = acquireRuntimeLease(raiz, 'supervisor')
    assert.equal(fs.existsSync(ruta), true, 'el nuevo dueño escribe su candado')
    release()
    assert.equal(fs.existsSync(ruta), false, 'al liberar se borra el candado')
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true })
  }
})

test('un candado corrupto no bloquea el arranque', () => {
  const raiz = crearRaiz()
  try {
    const ruta = path.join(raiz, 'runtime-pids', 'supervisor.lock')
    fs.writeFileSync(ruta, '{roto')
    const release = acquireRuntimeLease(raiz, 'supervisor')
    release()
    assert.equal(fs.existsSync(ruta), false)
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true })
  }
})

test('unique:false registra el PID sin exigir el candado', () => {
  const raiz = crearRaiz()
  try {
    escribirCandado(raiz, 'primary', { pid: process.pid, edadMs: 0 })
    const release = acquireRuntimeLease(raiz, 'primary', { unique: false })
    assert.equal(
      fs.existsSync(path.join(raiz, 'runtime-pids', `primary-${process.pid}.json`)),
      true
    )
    release()
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true })
  }
})
