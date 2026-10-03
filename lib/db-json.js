import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { Writer } from 'steno'

function ceder() {
  return new Promise((resolve) => setImmediate(resolve))
}

async function unirCediendo(partes) {
  let lista = partes
  while (lista.length > 1) {
    const siguiente = []
    for (let i = 0; i < lista.length; i += 24) {
      siguiente.push(lista.slice(i, i + 24).join(''))
      if (siguiente.length % 4 === 0) await ceder()
    }
    lista = siguiente
  }
  return lista[0] || ''
}

function esMapaGrande(valor) {
  return valor && typeof valor === 'object' && !Array.isArray(valor) && Object.keys(valor).length > 60
}

/**
 * Arma el JSON por tandas y suelta el hilo entre ellas.
 * Un stringify de todo el archivo (12 MB o más) frenaba comandos de todos los bots.
 */
export async function stringifyPorPartes(valor) {
  if (valor === undefined) return undefined
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor)
  if (Array.isArray(valor)) {
    const partes = ['[']
    for (let i = 0; i < valor.length; i++) {
      const pieza = await stringifyPorPartes(valor[i])
      partes.push(pieza === undefined ? 'null' : pieza)
      if (i < valor.length - 1) partes.push(',')
      if (i > 0 && i % 80 === 0) await ceder()
    }
    partes.push(']')
    return unirCediendo(partes)
  }

  const partes = ['{']
  let escritos = 0
  let desdeCeder = 0
  for (const clave in valor) {
    if (!Object.prototype.hasOwnProperty.call(valor, clave)) continue
    const crudo = valor[clave]
    if (typeof crudo === 'function' || typeof crudo === 'symbol' || crudo === undefined) continue
    const cuerpo = esMapaGrande(crudo)
      ? await stringifyPorPartes(crudo)
      : JSON.stringify(crudo)
    if (cuerpo === undefined) continue
    if (escritos) partes.push(',')
    partes.push(JSON.stringify(clave), ':', cuerpo)
    escritos++
    desdeCeder++
    if (desdeCeder >= 20) {
      desdeCeder = 0
      await ceder()
    }
  }
  partes.push('}')
  return unirCediendo(partes)
}

/**
 * Igual que el JSON de lowdb, sin sangría.
 * El contador de spam no se guarda: se arma de nuevo en memoria y no infla el archivo.
 */
export class ArchivoJsonCompacto {
  constructor(filename) {
    this.filename = filename
    this.writer = new Writer(filename)
  }

  async read() {
    try {
      const data = await fs.promises.readFile(this.filename, 'utf8')
      return JSON.parse(data)
    } catch (e) {
      if (e?.code === 'ENOENT') return null
      throw e
    }
  }

  async write(obj) {
    if (obj == null) return
    const { spamCount, ...resto } = obj
    const texto = await stringifyPorPartes(resto)
    return this.writer.write(texto)
  }
}

/**
 * Writer opt-in for future multi-process deployments.
 *
 * The lock serializes writes and the baseline check rejects stale snapshots
 * instead of silently replacing newer data. It is intentionally not enabled
 * by the current runtime: callers must refresh and reconcile a conflict before
 * retrying, which LowDB's mutable in-memory API does not do automatically.
 */
export class ArchivoJsonCoordinado {
  constructor(filename, { lockTimeoutMs = 15_000 } = {}) {
    this.filename = filename
    this.lockPath = `${filename}.lock`
    this.lockTimeoutMs = lockTimeoutMs
    this.baseline = null
    this.writeChain = Promise.resolve()
  }

  async read() {
    try {
      const data = JSON.parse(await fs.promises.readFile(this.filename, 'utf8'))
      this.baseline = this.#normalizar(data)
      return data
    } catch (error) {
      if (error?.code === 'ENOENT') {
        this.baseline = null
        return null
      }
      throw error
    }
  }

  write(data) {
    if (data == null) return Promise.resolve()
    const operation = this.writeChain.then(() => this.#writeCoordinado(data))
    this.writeChain = operation.catch(() => {})
    return operation
  }

  #normalizar(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return JSON.stringify(data)
    const { spamCount, ...resto } = data
    return JSON.stringify(resto)
  }

  async #readActual() {
    try {
      return this.#normalizar(JSON.parse(await fs.promises.readFile(this.filename, 'utf8')))
    } catch (error) {
      if (error?.code === 'ENOENT') return null
      throw error
    }
  }

  async #adquirirLock() {
    await fs.promises.mkdir(path.dirname(this.filename), { recursive: true })
    const iniciado = Date.now()
    let espera = 20
    while (true) {
      try {
        await fs.promises.mkdir(this.lockPath)
        return
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error
        if (Date.now() - iniciado >= this.lockTimeoutMs) {
          const timeout = new Error(`Tiempo agotado esperando el bloqueo de la base de datos: ${this.filename}`)
          timeout.code = 'ERR_DB_LOCK_TIMEOUT'
          throw timeout
        }
        await new Promise((resolve) => setTimeout(resolve, espera))
        espera = Math.min(espera * 2, 250)
      }
    }
  }

  async #writeCoordinado(data) {
    await this.#adquirirLock()
    let temporal
    try {
      const actual = await this.#readActual()
      if (actual !== this.baseline) {
        const conflicto = new Error(`La base de datos cambió desde la última lectura; se rechazó una escritura obsoleta: ${this.filename}`)
        conflicto.code = 'ERR_DB_STALE_WRITE'
        throw conflicto
      }

      const { spamCount, ...resto } = data
      const texto = await stringifyPorPartes(resto)
      temporal = `${this.filename}.${process.pid}.${randomUUID()}.tmp`
      await fs.promises.writeFile(temporal, texto, 'utf8')
      await fs.promises.rename(temporal, this.filename)
      temporal = null
      this.baseline = this.#normalizar(resto)
    } finally {
      if (temporal) await fs.promises.rm(temporal, { force: true }).catch(() => {})
      await fs.promises.rmdir(this.lockPath).catch(() => {})
    }
  }
}
