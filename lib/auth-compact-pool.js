/**
 * Pool mínimo de hilos para compactar el almacén de auth.
 *
 * La compactación hace `JSON.stringify` de todas las claves Signal de una
 * sesión. En el hilo principal eso bloqueaba los sockets durante decenas de
 * segundos (se vieron 45 s para 262 claves) y WhatsApp terminaba cerrando con
 * 408/428. El trabajo pesado se hace aquí, en un hilo aparte.
 *
 * Los workers se crean bajo demanda y se reutilizan mientras haya trabajo en
 * cola. Al quedarse sin trabajos se apagan: no dejan hilos vivos en reposo ni
 * impiden que el proceso salga.
 */
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'

const RUTA_WORKER = fileURLToPath(new URL('./auth-compact-worker.js', import.meta.url))

function enteroEnv(nombre, defecto, minimo, maximo) {
  const valor = Number.parseInt(process.env[nombre], 10)
  if (!Number.isInteger(valor)) return defecto
  return Math.min(Math.max(valor, minimo), maximo)
}

const MAX_WORKERS = enteroEnv('PAIN_AUTH_WORKERS', 2, 1, 4)
const TRABAJO_TIMEOUT_MS = enteroEnv('PAIN_AUTH_COMPACT_TIMEOUT_MS', 120_000, 10_000, 600_000)

const cola = []
const todos = new Set()
let secuencia = 0

class Hueco {
  constructor() {
    this.worker = new Worker(RUTA_WORKER)
    this.worker.unref()
    this.trabajo = null
    this.cerrado = false
    this.temporizadorTrabajo = null
    this.worker.on('message', (mensaje) => this.#mensaje(mensaje))
    this.worker.on('error', (error) => this.#error(error))
    this.worker.on('exit', (codigo) => this.#salida(codigo))
  }

  ejecutar(trabajo) {
    this.trabajo = trabajo
    this.#limpiarTemporizador()
    this.temporizadorTrabajo = setTimeout(() => {
      this.temporizadorTrabajo = null
      const actual = this.trabajo
      this.trabajo = null
      // Un hilo colgado no puede seguir escribiendo el snapshot mientras otro
      // compacta la misma sesión: se mata y se libera el hueco.
      this.terminar()
      if (actual) actual.reject(new Error('La compactación de auth superó el tiempo límite.'))
      despachar()
    }, TRABAJO_TIMEOUT_MS)
    this.temporizadorTrabajo.unref?.()
    try {
      this.worker.postMessage(trabajo.mensaje)
    } catch (error) {
      this.#error(error)
    }
  }

  #limpiarTemporizador() {
    if (this.temporizadorTrabajo) clearTimeout(this.temporizadorTrabajo)
    this.temporizadorTrabajo = null
  }

  #mensaje(mensaje) {
    const trabajo = this.trabajo
    this.trabajo = null
    this.#limpiarTemporizador()
    if (!trabajo) return
    if (mensaje?.id !== trabajo.mensaje?.id) {
      // Respuesta de un trabajo que ya se dio por perdido por timeout.
      alLiberar(this)
      return
    }
    trabajo.resolve(mensaje)
    alLiberar(this)
  }

  #error(error) {
    const trabajo = this.trabajo
    this.trabajo = null
    this.#limpiarTemporizador()
    this.terminar()
    if (trabajo) trabajo.reject(error)
    despachar()
  }

  #salida(codigo) {
    const trabajo = this.trabajo
    this.trabajo = null
    this.#limpiarTemporizador()
    this.cerrado = true
    todos.delete(this)
    if (trabajo) {
      trabajo.reject(new Error(`El hilo de compactación de auth terminó (código ${codigo}).`))
    }
    despachar()
  }

  terminar() {
    if (this.cerrado) return
    this.cerrado = true
    this.#limpiarTemporizador()
    todos.delete(this)
    void this.worker.terminate().catch(() => {})
  }
}

function alLiberar(hueco) {
  if (hueco.cerrado) return
  if (cola.length) {
    hueco.ejecutar(cola.shift())
    return
  }
  // Sin trabajo pendiente: se apaga. El siguiente lote crea un hilo nuevo.
  hueco.terminar()
}

function despachar() {
  while (cola.length) {
    if (todos.size >= MAX_WORKERS) return
    const hueco = new Hueco()
    todos.add(hueco)
    hueco.ejecutar(cola.shift())
  }
}

/**
 * Compacta `carpeta` en un hilo aparte. Devuelve la respuesta del worker
 * ({ ok, ms, bytes }) o rechaza si el hilo no pudo hacer el trabajo.
 */
export function compactarAuthEnWorker({ carpeta, diarios = [], keyT = Date.now() } = {}) {
  return new Promise((resolve, reject) => {
    cola.push({
      mensaje: { id: ++secuencia, carpeta, diarios, keyT },
      resolve,
      reject
    })
    despachar()
  })
}

/** Cierra los hilos (solo para pruebas/apagado controlado). */
export function cerrarWorkersAuth() {
  for (const hueco of [...todos]) hueco.terminar()
}
