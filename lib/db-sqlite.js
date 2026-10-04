import fs from 'node:fs'
import path from 'node:path'
import sqlite3 from 'sqlite3'
const RUTA_RESPALDO = '.pre-sqlite.bak'
const CONTADORES_ADITIVOS = new Set(['msgCount', 'commandCount', 'stickerCount', 'level'])

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

function combinarCambios(base, local, actual, clave = '', clavePadre = '', resolverConflicto = null) {
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
            if (resolverConflicto) {
              destino[propiedad] = resolverConflicto(
                baseObjeto[propiedad],
                undefined,
                destino[propiedad],
                propiedad,
                clave
              )
              continue
            }
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
        clave,
        resolverConflicto
      )
    }
    return destino
  }

  if (mismoValor(base, actual) || mismoValor(local, actual)) return clonar(local)
  if (resolverConflicto) {
    return resolverConflicto(base, local, actual, clave, clavePadre)
  }
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

function abrirSqlite(filename, busyTimeoutMs) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filename, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (error) => {
      if (error) {
        reject(error)
        return
      }
      db.configure('busyTimeout', busyTimeoutMs)
      resolve(db)
    })
  })
}

function ejecutar(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      if (error) reject(error)
      else resolve(this.changes)
    })
  })
}

function consultar(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null))
  })
}

function consultarTodos(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || []))
  })
}

function ejecutarLote(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (error) => error ? reject(error) : resolve())
  })
}

function cerrarSqlite(db) {
  return new Promise((resolve, reject) => {
    db.close((error) => error ? reject(error) : resolve())
  })
}

function leerEstado(payload, filename) {
  if (typeof payload !== 'string') throw new Error(`La base SQLite no contiene estado: ${filename}`)
  const datos = JSON.parse(payload)
  if (!esObjeto(datos)) throw new TypeError('La base SQLite contiene datos con una raíz inválida.')
  return datos
}

function esBusy(error) {
  return error?.code === 'SQLITE_BUSY' || error?.code === 'SQLITE_LOCKED'
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class ArchivoSqliteCompartido {
  constructor(filename, legacyFilename, { lockTimeoutMs = 30_000 } = {}) {
    this.filename = filename
    this.legacyFilename = legacyFilename
    this.claimsFilename = `${filename}.claims.sqlite`
    this.lockTimeoutMs = lockTimeoutMs
    this.baseline = null
    this.revision = null
    this.writeChain = Promise.resolve()
    this.writeQueues = new Map()
    this.ensurePromise = null
    this.ensureClaimsPromise = null
  }

  async read() {
    await this.#asegurarDb()
    const db = await abrirSqlite(this.filename, this.lockTimeoutMs)
    try {
      const row = await consultar(db, 'SELECT payload, revision FROM bot_state WHERE id = 1')
      const datos = leerEstado(row?.payload, this.filename)
      this.baseline = clonar(datos)
      this.revision = Number(row.revision)
      return clonar(datos)
    } finally {
      await cerrarSqlite(db)
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
    const db = await abrirSqlite(this.filename, this.lockTimeoutMs)
    let row
    try {
      row = await consultar(db, 'SELECT payload, revision FROM bot_state WHERE id = 1')
    } finally {
      await cerrarSqlite(db)
    }
    if (Number(row?.revision) === this.revision) return datosVivos

    const actual = leerEstado(row?.payload, this.filename)
    const local = clonar(JSON.parse(serializarDatos(datosVivos)))
    let conflictos = 0
    const combinado = combinarCambios(
      this.baseline,
      local,
      actual,
      '',
      '',
      (_base, _local, confirmado) => {
        conflictos++
        return clonar(confirmado)
      }
    )
    if (Object.prototype.hasOwnProperty.call(datosVivos, 'spamCount')) {
      combinado.spamCount = clonar(datosVivos.spamCount)
    }
    actualizarObjetoVivo(datosVivos, combinado)
    this.baseline = clonar(actual)
    this.revision = Number(row.revision)
    if (conflictos) {
      console.warn(`[db] Se conservaron los valores confirmados en ${conflictos} campo(s) en conflicto durante la sincronización.`)
    }
    return datosVivos
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
    const resultado = await this.#transaccion(this.filename, async (db) => {
      const row = await consultar(db, 'SELECT payload, revision FROM bot_state WHERE id = 1')
      const actual = leerEstado(row?.payload, this.filename)
      const local = clonar(JSON.parse(serializarDatos(datosVivos)))
      const datos = combinarCambios(this.baseline, local, actual)
      const ahora = Date.now()
      const result = update(datos, ahora)
      if (result && typeof result.then === 'function') {
        throw new TypeError('La actualización económica debe ser síncrona dentro de la transacción.')
      }
      if (result?.claim === false) return { acquired: true, result }

      await this.#guardarEstado(db, datos)
      return { acquired: true, result, datos, revision: await this.#revision(db) }
    })
    if (!resultado.datos) return resultado
    this.baseline = clonar(resultado.datos)
    this.revision = resultado.revision
    if (Object.prototype.hasOwnProperty.call(datosVivos, 'spamCount')) {
      resultado.datos.spamCount = clonar(datosVivos.spamCount)
    }
    actualizarObjetoVivo(datosVivos, resultado.datos)
    return { acquired: resultado.acquired, result: resultado.result }
  }

  async claimCommand(datosVivos, claimKey, ttlMs = 120_000) {
    if (typeof claimKey !== 'string' || !claimKey || !Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new TypeError('La clave y la duración del reclamo deben ser válidas.')
    }
    await this.#asegurarDb()
    await this.#asegurarClaimsDb()
    return this.#transaccion(this.claimsFilename, async (db) => {
      const ahora = Date.now()
      const actual = await consultar(
        db,
        'SELECT expires_at FROM command_claims WHERE claim_key = ?',
        [claimKey]
      )
      if (Number(actual?.expires_at) > ahora) return false
      await ejecutar(db, 'DELETE FROM command_claims WHERE expires_at <= ?', [ahora])
      await ejecutar(
        db,
        `INSERT INTO command_claims (claim_key, expires_at) VALUES (?, ?)
         ON CONFLICT(claim_key) DO UPDATE SET expires_at = excluded.expires_at`,
        [claimKey, ahora + ttlMs]
      )
      return true
    })
  }

  async releaseCommand(claimKey) {
    if (typeof claimKey !== 'string' || !claimKey) {
      throw new TypeError('La clave del reclamo debe ser válida.')
    }
    await this.#asegurarDb()
    await this.#asegurarClaimsDb()
    return this.#transaccion(this.claimsFilename, async (db) => {
      const cambios = await ejecutar(db, 'DELETE FROM command_claims WHERE claim_key = ?', [claimKey])
      return cambios > 0
    })
  }

  async #asegurarClaimsDb() {
    if (!this.ensureClaimsPromise) {
      this.ensureClaimsPromise = this.#inicializarClaimsDb().catch((error) => {
        this.ensureClaimsPromise = null
        throw error
      })
    }
    return this.ensureClaimsPromise
  }

  async #inicializarClaimsDb() {
    const db = await this.#abrirConWAL(this.claimsFilename)
    try {
      await this.#transaccionConDb(db, async () => {
        await ejecutarLote(db, `
          CREATE TABLE IF NOT EXISTS command_claims (
            claim_key TEXT PRIMARY KEY,
            expires_at INTEGER NOT NULL
          )
        `)
        await ejecutarLote(
          db,
          'CREATE INDEX IF NOT EXISTS idx_command_claims_expiry ON command_claims (expires_at)'
        )
      })
    } finally {
      await cerrarSqlite(db)
    }

    await this.#asegurarDb()
    const principal = await abrirSqlite(this.filename, this.lockTimeoutMs)
    let claimsAntiguos = []
    try {
      const tabla = await consultar(
        principal,
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'command_claims'`
      )
      if (tabla) {
        claimsAntiguos = await consultarTodos(
          principal,
          'SELECT claim_key, expires_at FROM command_claims WHERE expires_at > ?',
          [Date.now()]
        )
      }
    } finally {
      await cerrarSqlite(principal)
    }
    if (!claimsAntiguos.length) return

    await this.#transaccion(this.claimsFilename, async (claimsDb) => {
      for (const { claim_key, expires_at } of claimsAntiguos) {
        await ejecutar(
          claimsDb,
          'INSERT OR IGNORE INTO command_claims (claim_key, expires_at) VALUES (?, ?)',
          [claim_key, expires_at]
        )
      }
    })
  }

  async #asegurarDb() {
    if (!this.ensurePromise) {
      this.ensurePromise = this.#inicializarDb().catch((error) => {
        this.ensurePromise = null
        throw error
      })
    }
    return this.ensurePromise
  }

  async #inicializarDb() {
    let datos = {}
    let original
    try {
      await fs.promises.access(this.filename)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      try {
        original = await fs.promises.readFile(this.legacyFilename)
        datos = JSON.parse(serializarDatos(JSON.parse(original.toString('utf8'))))
        const respaldo = `${this.legacyFilename}${RUTA_RESPALDO}`
        try {
          await fs.promises.copyFile(this.legacyFilename, respaldo, fs.constants.COPYFILE_EXCL)
        } catch (copyError) {
          if (copyError?.code !== 'EEXIST') throw copyError
          const copia = await fs.promises.readFile(respaldo)
          if (!copia.equals(original)) {
            throw new Error(`El respaldo existente no coincide con el JSON original: ${respaldo}`)
          }
        }
      } catch (readError) {
        if (readError?.code !== 'ENOENT' || original) throw readError
      }
    }

    const db = await this.#abrirConWAL(this.filename)
    try {
      await this.#transaccionConDb(db, async () => {
        await ejecutarLote(db, `
          CREATE TABLE IF NOT EXISTS bot_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            payload TEXT NOT NULL,
            revision INTEGER NOT NULL DEFAULT 0
          )
        `)
        const row = await consultar(db, 'SELECT id FROM bot_state WHERE id = 1')
        if (!row) await this.#guardarEstado(db, datos)
      })
      const row = await consultar(db, 'SELECT payload FROM bot_state WHERE id = 1')
      leerEstado(row?.payload, this.filename)
    } finally {
      await cerrarSqlite(db)
    }
  }

  async #escribir(datosVivos, requested) {
    if (!this.baseline) await this.read()
    if (mismoValor(this.baseline, requested)) {
      await this.refresh(datosVivos)
      return
    }
    let escrito
    let revision
    await this.#asegurarDb()
    await this.#transaccion(this.filename, async (db) => {
      const row = await consultar(db, 'SELECT payload, revision FROM bot_state WHERE id = 1')
      const actual = leerEstado(row?.payload, this.filename)
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
      if (!mismoValor(actual, combinado)) await this.#guardarEstado(db, combinado)
      escrito = combinado
      revision = await this.#revision(db)
    })

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
    this.revision = revision
  }

  async #abrirConWAL(filename) {
    await fs.promises.mkdir(path.dirname(filename), { recursive: true })
    const db = await abrirSqlite(filename, 0)
    try {
      const started = Date.now()
      let wait = 5
      while (true) {
        try {
          const journal = await consultar(db, 'PRAGMA journal_mode = WAL')
          if (String(journal?.journal_mode).toLowerCase() !== 'wal') {
            throw new Error(`SQLite no pudo activar WAL para ${filename}.`)
          }
          break
        } catch (error) {
          if (!esBusy(error)) throw error
          if (Date.now() - started >= this.lockTimeoutMs) {
            const timeout = new Error(`Tiempo agotado habilitando WAL para ${filename}.`)
            timeout.code = 'ERR_SQLITE_LOCK_TIMEOUT'
            throw timeout
          }
          await esperar(wait + Math.floor(Math.random() * wait))
          wait = Math.min(wait * 2, 100)
        }
      }
      await ejecutarLote(db, 'PRAGMA synchronous = NORMAL')
      return db
    } catch (error) {
      await cerrarSqlite(db)
      throw error
    }
  }

  async #guardarEstado(db, datos) {
    await ejecutar(
      db,
      `INSERT INTO bot_state (id, payload, revision) VALUES (1, ?, 1)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, revision = bot_state.revision + 1`,
      [JSON.stringify(datos)]
    )
  }

  async #revision(db) {
    const row = await consultar(db, 'SELECT revision FROM bot_state WHERE id = 1')
    return Number(row?.revision ?? 0)
  }

  async #transaccion(filename, operation) {
    const anterior = this.writeQueues.get(filename) || Promise.resolve()
    const actual = anterior.then(async () => {
      const db = await abrirSqlite(filename, 0)
      try {
        return await this.#transaccionConDb(db, () => operation(db))
      } finally {
        await cerrarSqlite(db)
      }
    })
    this.writeQueues.set(filename, actual.catch(() => {}))
    return actual
  }

  async #transaccionConDb(db, operation) {
    const started = Date.now()
    let wait = 5
    while (true) {
      try {
        await ejecutarLote(db, 'BEGIN IMMEDIATE')
        break
      } catch (error) {
        if (!esBusy(error)) throw error
        if (Date.now() - started >= this.lockTimeoutMs) {
          const timeout = new Error(`Tiempo agotado esperando una transacción SQLite: ${this.filename}`)
          timeout.code = 'ERR_SQLITE_LOCK_TIMEOUT'
          throw timeout
        }
        await esperar(wait + Math.floor(Math.random() * wait))
        wait = Math.min(wait * 2, 100)
      }
    }
    try {
      const result = await operation()
      await ejecutarLote(db, 'COMMIT')
      return result
    } catch (error) {
      await ejecutarLote(db, 'ROLLBACK').catch(() => {})
      throw error
    }
  }
}
