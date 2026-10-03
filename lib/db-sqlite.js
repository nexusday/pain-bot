import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import initSqlJs from 'sql.js'

const require = createRequire(import.meta.url)
const RUTA_RESPALDO = '.pre-sqlite.bak'
const CONTADORES_ADITIVOS = new Set(['msgCount', 'commandCount', 'stickerCount', 'level'])
const SQL_READY = initSqlJs({
  locateFile: (filename) => require.resolve(`sql.js/dist/${filename}`),
})

function clonar(valor) {
  if (valor === undefined) return undefined
  return JSON.parse(JSON.stringify(valor))
}

function esObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
}

function serializarDatos(valor) {
  if (valor == null || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new TypeError('La raíz de la base de datos debe ser un objeto JSON.')
  }
  const { spamCount, ...resto } = valor
  return JSON.stringify(resto)
}

function mismoValor(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function combinarCambios(base, local, actual, clave = '', clavePadre = '') {
  if (mismoValor(base, local)) return clonar(actual)

  if (
    (CONTADORES_ADITIVOS.has(clave) || clave === 'exp' || clavePadre === 'msgByChat') &&
    Number.isFinite(base) &&
    Number.isFinite(local) &&
    Number.isFinite(actual) &&
    (clave === 'exp' || local >= base)
  ) {
    return actual + (local - base)
  }

  if (esObjeto(local) && (esObjeto(base) || base === undefined)) {
    const destino = esObjeto(actual) ? clonar(actual) : {}
    const baseObjeto = esObjeto(base) ? base : {}
    const claves = new Set([...Object.keys(baseObjeto), ...Object.keys(local)])
    for (const propiedad of claves) {
      const baseTiene = Object.prototype.hasOwnProperty.call(baseObjeto, propiedad)
      const localTiene = Object.prototype.hasOwnProperty.call(local, propiedad)
      const actualTiene = Object.prototype.hasOwnProperty.call(destino, propiedad)

      if (!localTiene) {
        if (baseTiene && actualTiene) {
          if (!mismoValor(baseObjeto[propiedad], destino[propiedad])) {
            throw new Error(`Conflicto SQLite al borrar el campo ${propiedad}`)
          }
          delete destino[propiedad]
        }
        continue
      }

      const valorBase = baseTiene ? baseObjeto[propiedad] : undefined
      const valorLocal = local[propiedad]
      const valorActual = actualTiene ? destino[propiedad] : undefined
      if (
        propiedad === 'lastMsgAt' &&
        Number.isFinite(valorLocal) &&
        Number.isFinite(valorActual)
      ) {
        destino[propiedad] = Math.max(valorLocal, valorActual)
        continue
      }
      if (propiedad === 'lastMsgChat' && actualTiene && baseTiene) {
        const tiempoLocal = Number(local.lastMsgAt) || 0
        const tiempoActual = Number(esObjeto(actual) ? actual.lastMsgAt : 0) || 0
        if (tiempoLocal !== tiempoActual) {
          destino[propiedad] = tiempoLocal >= tiempoActual ? valorLocal : valorActual
          continue
        }
      }
      if (!actualTiene && !baseTiene) {
        destino[propiedad] = clonar(valorLocal)
        continue
      }

      destino[propiedad] = combinarCambios(
        valorBase,
        valorLocal,
        valorActual,
        propiedad,
        clave
      )
    }
    return destino
  }

  if (mismoValor(base, actual) || mismoValor(local, actual)) return clonar(local)
  const conflicto = new Error(`Conflicto SQLite en el campo ${clave || '(raíz)'}; se conserva la versión confirmada.`)
  conflicto.code = 'ERR_SQLITE_WRITE_CONFLICT'
  throw conflicto
}

function actualizarObjetoVivo(destino, origen) {
  for (const clave of Object.keys(destino)) {
    if (!Object.prototype.hasOwnProperty.call(origen, clave)) delete destino[clave]
  }
  for (const [clave, valor] of Object.entries(origen)) {
    if (esObjeto(valor) && esObjeto(destino[clave])) {
      actualizarObjetoVivo(destino[clave], valor)
    } else {
      destino[clave] = clonar(valor)
    }
  }
}

function leerEstado(db) {
  const filas = db.exec('SELECT payload FROM bot_state WHERE id = 1')
  if (!filas.length || !filas[0].values.length) return null
  const payload = filas[0].values[0][0]
  const datos = JSON.parse(payload)
  if (!esObjeto(datos)) throw new TypeError('La base SQLite contiene datos con una raíz inválida.')
  return datos
}

function escribirEstado(db, datos, claims = {}) {
  db.run(`
    CREATE TABLE IF NOT EXISTS bot_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0
    )
  `)
  const payload = JSON.stringify(datos)
  db.run(
    `INSERT INTO bot_state (id, payload, revision) VALUES (1, ?, 1)
     ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, revision = bot_state.revision + 1`,
    [payload]
  )
  db.run(`
    CREATE TABLE IF NOT EXISTS command_claims (
      claim_key TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    )
  `)
  for (const [claimKey, expiresAt] of Object.entries(claims)) {
    db.run(
      'INSERT INTO command_claims (claim_key, expires_at) VALUES (?, ?)',
      [claimKey, expiresAt]
    )
  }
}

function leerCommandClaims(db) {
  try {
    return db.exec('SELECT claim_key, expires_at FROM command_claims')[0]?.values || []
  } catch (error) {
    if (String(error?.message || '').includes('no such table')) return []
    throw error
  }
}

export class ArchivoSqliteCompartido {
  constructor(filename, legacyFilename, { lockTimeoutMs = 30_000 } = {}) {
    this.filename = filename
    this.legacyFilename = legacyFilename
    this.lockPath = `${filename}.lock`
    this.lockTimeoutMs = lockTimeoutMs
    this.baseline = null
    this.fileVersion = null
    this.writeChain = Promise.resolve()
  }

  async read() {
    await this.#asegurarDb()
    const SQL = await SQL_READY
    const buffer = await fs.promises.readFile(this.filename)
    const db = new SQL.Database(buffer)
    try {
      const datos = leerEstado(db)
      if (!datos) throw new Error(`La base SQLite no contiene estado: ${this.filename}`)
      this.baseline = datos
      this.fileVersion = await this.#versionArchivo()
      return clonar(datos)
    } finally {
      db.close()
    }
  }

  write(datosVivos) {
    if (datosVivos == null) return Promise.resolve()
    const requested = clonar(JSON.parse(serializarDatos(datosVivos)))
    const operation = this.writeChain.then(() => this.#escribir(datosVivos, requested))
    this.writeChain = operation.catch(() => {})
    return operation
  }

  async refresh(datosVivos) {
    if (!esObjeto(datosVivos)) throw new TypeError('No hay datos cargados para sincronizar.')
    await this.#asegurarDb()
    if (await this.#versionArchivo() === this.fileVersion) return datosVivos
    await this.#adquirirBloqueo()
    try {
      if (await this.#versionArchivo() === this.fileVersion) return datosVivos
      const actual = await this.#leerArchivoSqlite()
      const local = clonar(JSON.parse(serializarDatos(datosVivos)))
      const combinado = combinarCambios(this.baseline, local, actual)
      if (Object.prototype.hasOwnProperty.call(datosVivos, 'spamCount')) {
        combinado.spamCount = clonar(datosVivos.spamCount)
      }
      const claims = await this.#leerClaimsArchivo()
      if (!mismoValor(actual, combinado)) {
        const estadoPersistente = clonar(combinado)
        delete estadoPersistente.spamCount
        await this.#guardarArchivoSqlite(estadoPersistente, claims)
        this.baseline = clonar(estadoPersistente)
      } else {
        this.baseline = clonar(actual)
      }
      actualizarObjetoVivo(datosVivos, combinado)
      this.fileVersion = await this.#versionArchivo()
      return datosVivos
    } finally {
      await this.#liberarBloqueo()
    }
  }

  async claimAndUpdate(datosVivos, claimKey, ttlMs, update) {
    if (
      !esObjeto(datosVivos) ||
      typeof claimKey !== 'string' ||
      !claimKey ||
      !Number.isFinite(ttlMs) ||
      ttlMs <= 0 ||
      typeof update !== 'function'
    ) {
      throw new TypeError('Los datos, reclamo, duración y actualización deben ser válidos.')
    }
    await this.#asegurarDb()
    await this.#adquirirBloqueo()
    try {
      const SQL = await SQL_READY
      const db = new SQL.Database(await fs.promises.readFile(this.filename))
      let claimsFilas
      try {
        claimsFilas = leerCommandClaims(db)
      } finally {
        db.close()
      }
      const ahora = Date.now()
      if (claimsFilas.some(([key, expiry]) => key === claimKey && Number(expiry) > ahora)) {
        return { acquired: false, result: undefined }
      }

      const actual = await this.#leerArchivoSqlite()
      const local = clonar(JSON.parse(serializarDatos(datosVivos)))
      const datos = combinarCambios(this.baseline, local, actual)
      const result = await update(datos, ahora)
      if (result?.claim === false) {
        return { acquired: true, result }
      }
      const claims = Object.fromEntries(
        claimsFilas.filter(([, expiry]) => Number(expiry) > ahora)
      )
      claims[claimKey] = ahora + ttlMs
      await this.#guardarArchivoSqlite(datos, claims)
      this.baseline = clonar(datos)
      this.fileVersion = await this.#versionArchivo()
      if (Object.prototype.hasOwnProperty.call(datosVivos, 'spamCount')) {
        datos.spamCount = clonar(datosVivos.spamCount)
      }
      actualizarObjetoVivo(datosVivos, datos)
      return { acquired: true, result }
    } finally {
      await this.#liberarBloqueo()
    }
  }

  async claimCommand(datosVivos, claimKey, ttlMs = 120_000) {
    if (typeof claimKey !== 'string' || !claimKey || !Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new TypeError('La clave y la duración del reclamo deben ser válidas.')
    }
    await this.#asegurarDb()
    await this.#adquirirBloqueo()
    try {
      const SQL = await SQL_READY
      const db = new SQL.Database(await fs.promises.readFile(this.filename))
      let claimsFilas
      try {
        claimsFilas = leerCommandClaims(db)
      } finally {
        db.close()
      }
      const ahora = Date.now()
      if (claimsFilas.some(([key, expiry]) => key === claimKey && Number(expiry) > ahora)) {
        return false
      }
      const datos = await this.#leerArchivoSqlite()
      const claims = Object.fromEntries(
        claimsFilas.filter(([, expiry]) => Number(expiry) > ahora)
      )
      claims[claimKey] = ahora + ttlMs
      await this.#guardarArchivoSqlite(datos, claims)
      this.fileVersion = await this.#versionArchivo()
      return true
    } finally {
      await this.#liberarBloqueo()
    }
  }

  async releaseCommand(claimKey) {
    if (typeof claimKey !== 'string' || !claimKey) {
      throw new TypeError('La clave del reclamo debe ser válida.')
    }
    await this.#asegurarDb()
    await this.#adquirirBloqueo()
    try {
      const datos = await this.#leerArchivoSqlite()
      const claims = await this.#leerClaimsArchivo()
      if (!Object.prototype.hasOwnProperty.call(claims, claimKey)) return false
      delete claims[claimKey]
      await this.#guardarArchivoSqlite(datos, claims)
      this.fileVersion = await this.#versionArchivo()
      return true
    } finally {
      await this.#liberarBloqueo()
    }
  }

  async #asegurarDb() {
    try {
      await fs.promises.access(this.filename)
      return
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }

    await this.#adquirirBloqueo()
    try {
      try {
        await fs.promises.access(this.filename)
        return
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }

      let datos = {}
      let respaldo = null
      try {
        const original = await fs.promises.readFile(this.legacyFilename)
        datos = JSON.parse(serializarDatos(JSON.parse(original.toString('utf8'))))
        respaldo = `${this.legacyFilename}${RUTA_RESPALDO}`
        try {
          await fs.promises.copyFile(this.legacyFilename, respaldo, fs.constants.COPYFILE_EXCL)
        } catch (error) {
          if (error?.code !== 'EEXIST') throw error
          const copia = await fs.promises.readFile(respaldo)
          if (!copia.equals(original)) {
            throw new Error(`El respaldo existente no coincide con el JSON original: ${respaldo}`)
          }
        }
      } catch (error) {
        if (error?.code !== 'ENOENT' || respaldo) throw error
      }

      await this.#guardarArchivoSqlite(datos)
      const verificado = await this.#leerArchivoSqlite()
      if (!mismoValor(verificado, datos)) {
        await fs.promises.rm(this.filename, { force: true })
        throw new Error('La verificación de la importación JSON a SQLite no coincide.')
      }
    } finally {
      await this.#liberarBloqueo()
    }
  }

  async #escribir(datosVivos, requested) {
    if (!this.baseline) await this.read()
    await this.#adquirirBloqueo()
    let escrito
    try {
      const actual = await this.#leerArchivoSqlite()
      let combinado
      try {
        combinado = combinarCambios(this.baseline, requested, actual)
      } catch (error) {
        if (error?.code === 'ERR_SQLITE_WRITE_CONFLICT') throw error
        const conflicto = new Error(
          `Conflicto SQLite en ${this.filename}; se rechazó la escritura para proteger los datos.`,
          { cause: error }
        )
        conflicto.code = 'ERR_SQLITE_WRITE_CONFLICT'
        throw conflicto
      }
      if (mismoValor(actual, combinado)) {
        escrito = actual
      } else {
        await this.#guardarArchivoSqlite(combinado, await this.#leerClaimsArchivo())
        escrito = combinado
      }
    } finally {
      await this.#liberarBloqueo()
    }

    let cambiosDuranteEscritura
    try {
      cambiosDuranteEscritura = combinarCambios(
        requested,
        clonar(JSON.parse(serializarDatos(datosVivos))),
        escrito
      )
    } catch (error) {
      if (error?.code !== 'ERR_SQLITE_WRITE_CONFLICT') throw error
      cambiosDuranteEscritura = clonar(JSON.parse(serializarDatos(datosVivos)))
    }
    if (Object.prototype.hasOwnProperty.call(datosVivos, 'spamCount')) {
      cambiosDuranteEscritura.spamCount = clonar(datosVivos.spamCount)
    }
    actualizarObjetoVivo(datosVivos, cambiosDuranteEscritura)
    this.baseline = clonar(escrito)
    this.fileVersion = await this.#versionArchivo()
  }

  async #versionArchivo() {
    const stats = await fs.promises.stat(this.filename, { bigint: true })
    return `${stats.size}:${stats.mtimeNs}`
  }

  async #leerArchivoSqlite() {
    const SQL = await SQL_READY
    const buffer = await fs.promises.readFile(this.filename)
    const db = new SQL.Database(buffer)
    try {
      const datos = leerEstado(db)
      if (!datos) throw new Error(`La base SQLite no contiene estado: ${this.filename}`)
      return datos
    } finally {
      db.close()
    }
  }

  async #leerClaimsArchivo() {
    const SQL = await SQL_READY
    const db = new SQL.Database(await fs.promises.readFile(this.filename))
    try {
      return Object.fromEntries(leerCommandClaims(db))
    } finally {
      db.close()
    }
  }

  async #guardarArchivoSqlite(datos, claims = {}) {
    const SQL = await SQL_READY
    const db = new SQL.Database()
    const temporal = `${this.filename}.${process.pid}.${Date.now()}.tmp`
    try {
      db.run('BEGIN IMMEDIATE')
      escribirEstado(db, datos, claims)
      db.run('COMMIT')
      await fs.promises.mkdir(path.dirname(this.filename), { recursive: true })
      await fs.promises.writeFile(temporal, Buffer.from(db.export()))
      await fs.promises.rename(temporal, this.filename)
    } catch (error) {
      try { db.run('ROLLBACK') } catch {}
      await fs.promises.rm(temporal, { force: true }).catch(() => {})
      throw error
    } finally {
      db.close()
    }
  }

  async #adquirirBloqueo() {
    await fs.promises.mkdir(path.dirname(this.filename), { recursive: true })
    const iniciado = Date.now()
    let espera = 20
    while (true) {
      try {
        await fs.promises.mkdir(this.lockPath)
        await fs.promises.writeFile(
          path.join(this.lockPath, 'owner.json'),
          JSON.stringify({ pid: process.pid, host: os.hostname(), createdAt: Date.now() }),
          'utf8'
        )
        return
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error
        await this.#retirarBloqueoAbandonado()
        if (Date.now() - iniciado >= this.lockTimeoutMs) {
          const timeout = new Error(`Tiempo agotado esperando el bloqueo SQLite: ${this.filename}`)
          timeout.code = 'ERR_SQLITE_LOCK_TIMEOUT'
          throw timeout
        }
        await new Promise((resolve) => setTimeout(resolve, espera))
        espera = Math.min(espera * 2, 250)
      }
    }
  }

  async #retirarBloqueoAbandonado() {
    let stat
    try {
      stat = await fs.promises.stat(this.lockPath)
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }
    if (Date.now() - stat.mtimeMs < 120_000) return

    let owner
    try {
      owner = JSON.parse(await fs.promises.readFile(path.join(this.lockPath, 'owner.json'), 'utf8'))
    } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    }

    if (owner?.host === os.hostname() && Number.isInteger(owner.pid)) {
      try {
        process.kill(owner.pid, 0)
        return
      } catch (error) {
        if (error?.code !== 'ESRCH') return
      }
    } else if (owner && owner.host !== os.hostname()) {
      return
    }
    await fs.promises.rm(this.lockPath, { recursive: true, force: true })
  }

  async #liberarBloqueo() {
    await fs.promises.rm(this.lockPath, { recursive: true, force: true })
  }
}
