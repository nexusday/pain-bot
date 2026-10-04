import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
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
    this.claimsFilename = `${filename}.claims.sqlite`
    this.claimsLockPath = `${this.claimsFilename}.lock`
    this.lockTimeoutMs = lockTimeoutMs
    this.baseline = null
    this.fileVersion = null
    this.writeChain = Promise.resolve()
    this.lockQueues = new Map()
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
    const actual = await this.#leerArchivoSqlite()
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
    this.fileVersion = await this.#versionArchivo()
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
    return this.#conBloqueo(this.lockPath, async (lockToken) => {
      const ahora = Date.now()
      const SQL = await SQL_READY
      const db = new SQL.Database(await fs.promises.readFile(this.filename))
      let claimsFilas
      try {
        claimsFilas = leerCommandClaims(db)
      } finally {
        db.close()
      }
      const claimActivo = claimsFilas.some(
        ([key, expiry]) => key === claimKey && Number(expiry) > ahora
      )
      const actual = await this.#leerArchivoSqlite()
      const local = clonar(JSON.parse(serializarDatos(datosVivos)))
      const datos = combinarCambios(this.baseline, local, actual)
      const result = await update(datos, ahora)
      if (result?.claim === false) {
        return { acquired: true, result }
      }
      if (claimActivo) return { acquired: false, result: undefined }
      const claimsAnteriores = await this.#leerClaimsArchivo()
      const claims = Object.fromEntries(
        Object.entries(claimsAnteriores).filter(([, expiry]) => Number(expiry) > ahora)
      )
      await this.#guardarArchivoSqlite(datos, claims, lockToken)
      this.baseline = clonar(datos)
      this.fileVersion = await this.#versionArchivo()
      if (Object.prototype.hasOwnProperty.call(datosVivos, 'spamCount')) {
        datos.spamCount = clonar(datosVivos.spamCount)
      }
      actualizarObjetoVivo(datosVivos, datos)
      return { acquired: true, result }
    })
  }

  async claimCommand(datosVivos, claimKey, ttlMs = 120_000) {
    if (typeof claimKey !== 'string' || !claimKey || !Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new TypeError('La clave y la duración del reclamo deben ser válidas.')
    }
    await this.#asegurarDb()
    await this.#asegurarClaimsDb()
    return this.#conBloqueo(this.claimsLockPath, async (lockToken) => {
      const ahora = Date.now()
      const claims = await this.#leerClaimsSidecar()
      if (Number(claims[claimKey]) > ahora) return false
      for (const [key, expiry] of Object.entries(claims)) {
        if (Number(expiry) <= ahora) delete claims[key]
      }
      claims[claimKey] = ahora + ttlMs
      await this.#guardarClaimsSidecar(claims, lockToken)
      return true
    })
  }

  async releaseCommand(claimKey) {
    if (typeof claimKey !== 'string' || !claimKey) {
      throw new TypeError('La clave del reclamo debe ser válida.')
    }
    await this.#asegurarDb()
    await this.#asegurarClaimsDb()
    return this.#conBloqueo(this.claimsLockPath, async (lockToken) => {
      const claims = await this.#leerClaimsSidecar()
      if (!Object.prototype.hasOwnProperty.call(claims, claimKey)) return false
      delete claims[claimKey]
      await this.#guardarClaimsSidecar(claims, lockToken)
      return true
    })
  }

  async #asegurarClaimsDb() {
    try {
      await fs.promises.access(this.claimsFilename)
      return
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }

    return this.#conBloqueo(this.claimsLockPath, async (lockToken) => {
      try {
        await fs.promises.access(this.claimsFilename)
        return
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }

      const ahora = Date.now()
      const claimsAnteriores = await this.#leerClaimsArchivo()
      const claimsVigentes = Object.fromEntries(
        Object.entries(claimsAnteriores).filter(([, expiracion]) => Number(expiracion) > ahora)
      )
      await this.#guardarClaimsSidecar(claimsVigentes, lockToken)
    })
  }

  async #leerClaimsSidecar() {
    const SQL = await SQL_READY
    const db = new SQL.Database(await fs.promises.readFile(this.claimsFilename))
    try {
      return Object.fromEntries(leerCommandClaims(db))
    } finally {
      db.close()
    }
  }

  async #guardarClaimsSidecar(claims, lockToken) {
    const SQL = await SQL_READY
    const db = new SQL.Database()
    const temporal = `${this.claimsFilename}.${process.pid}.${Date.now()}.tmp`
    try {
      db.run(`
        CREATE TABLE command_claims (
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
      await fs.promises.writeFile(temporal, Buffer.from(db.export()))
      await this.#verificarPropietario(this.claimsLockPath, lockToken)
      await fs.promises.rename(temporal, this.claimsFilename)
    } catch (error) {
      await fs.promises.rm(temporal, { force: true }).catch(() => {})
      throw error
    } finally {
      db.close()
    }
  }

  async #asegurarDb() {
    try {
      await fs.promises.access(this.filename)
      return
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }

    return this.#conBloqueo(this.lockPath, async (lockToken) => {
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

      await this.#guardarArchivoSqlite(datos, {}, lockToken)
      const verificado = await this.#leerArchivoSqlite()
      if (!mismoValor(verificado, datos)) {
        await fs.promises.rm(this.filename, { force: true })
        throw new Error('La verificación de la importación JSON a SQLite no coincide.')
      }
    })
  }

  async #escribir(datosVivos, requested) {
    if (!this.baseline) await this.read()
    if (
      mismoValor(this.baseline, requested) &&
      await this.#versionArchivo() === this.fileVersion
    ) {
      return
    }
    let escrito
    await this.#conBloqueo(this.lockPath, async (lockToken) => {
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
        await this.#guardarArchivoSqlite(
          combinado,
          await this.#leerClaimsArchivo(),
          lockToken
        )
        escrito = combinado
      }
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
    this.fileVersion = await this.#versionArchivo()
  }

  async #conBloqueo(lockPath, operacion) {
    const anterior = this.lockQueues.get(lockPath) || Promise.resolve()
    let liberarCola
    const turno = new Promise((resolve) => { liberarCola = resolve })
    const cola = anterior.then(() => turno)
    this.lockQueues.set(lockPath, cola)
    await anterior

    let token
    let heartbeat
    let renovando = false
    try {
      token = await this.#adquirirBloqueo(lockPath)
      heartbeat = setInterval(async () => {
        if (renovando) return
        renovando = true
        try {
          await this.#renovarBloqueo(lockPath, token)
        } catch (error) {
          console.error(`[db] No se pudo renovar el bloqueo ${lockPath}:`, error?.message || error)
        } finally {
          renovando = false
        }
      }, 10_000)
      heartbeat.unref?.()
      return await operacion(token)
    } finally {
      try {
        if (heartbeat) clearInterval(heartbeat)
        if (token) await this.#liberarBloqueo(lockPath, token)
      } finally {
        liberarCola()
        if (this.lockQueues.get(lockPath) === cola) this.lockQueues.delete(lockPath)
      }
    }
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

  async #guardarArchivoSqlite(datos, claims = {}, lockToken) {
    const SQL = await SQL_READY
    const db = new SQL.Database()
    const temporal = `${this.filename}.${process.pid}.${Date.now()}.tmp`
    try {
      db.run('BEGIN IMMEDIATE')
      escribirEstado(db, datos, claims)
      db.run('COMMIT')
      await fs.promises.mkdir(path.dirname(this.filename), { recursive: true })
      await fs.promises.writeFile(temporal, Buffer.from(db.export()))
      await this.#verificarPropietario(this.lockPath, lockToken)
      await fs.promises.rename(temporal, this.filename)
    } catch (error) {
      try { db.run('ROLLBACK') } catch {}
      await fs.promises.rm(temporal, { force: true }).catch(() => {})
      throw error
    } finally {
      db.close()
    }
  }

  async #adquirirBloqueo(lockPath = this.lockPath) {
    await fs.promises.mkdir(path.dirname(this.filename), { recursive: true })
    const iniciado = Date.now()
    let espera = 20
    let avisoEsperaEmitido = false
    while (true) {
      try {
        await fs.promises.mkdir(lockPath)
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error
        await this.#retirarBloqueoAbandonado(lockPath)
        const tiempoEsperando = Date.now() - iniciado
        if (!avisoEsperaEmitido && tiempoEsperando >= 10_000) {
          avisoEsperaEmitido = true
          const propietario = await this.#detallesBloqueo(lockPath)
          console.warn(
            `[db] Esperando el bloqueo ${lockPath} por ${Math.round(tiempoEsperando / 1000)}s` +
            `${propietario ? `; propietario: ${propietario}` : '; propietario desconocido'}.`
          )
        }
        if (tiempoEsperando >= this.lockTimeoutMs) {
          const propietario = await this.#detallesBloqueo(lockPath)
          const timeout = new Error(
            `Tiempo agotado esperando el bloqueo SQLite: ${lockPath}` +
            `${propietario ? ` (propietario: ${propietario})` : ' (no se pudo leer el propietario)'}`
          )
          timeout.code = 'ERR_SQLITE_LOCK_TIMEOUT'
          throw timeout
        }
        const variacion = Math.floor(Math.random() * Math.max(1, Math.min(100, espera)))
        await new Promise((resolve) => setTimeout(resolve, espera + variacion))
        espera = Math.min(espera * 2, 250)
        continue
      }

      const token = randomUUID()
      try {
        await fs.promises.writeFile(
          path.join(lockPath, 'owner.json'),
          JSON.stringify({ pid: process.pid, host: os.hostname(), token, createdAt: Date.now() }),
          'utf8'
        )
        return token
      } catch (error) {
        await fs.promises.rm(lockPath, { recursive: true, force: true })
        throw error
      }
    }
  }

  async #detallesBloqueo(lockPath) {
    try {
      const ownerPath = path.join(lockPath, 'owner.json')
      const [ownerText, stat] = await Promise.all([
        fs.promises.readFile(ownerPath, 'utf8'),
        fs.promises.stat(ownerPath),
      ])
      const owner = JSON.parse(ownerText)
      const ageSeconds = Math.max(0, Math.round((Date.now() - stat.mtimeMs) / 1000))
      return `pid=${owner.pid ?? '?'}, host=${owner.host ?? '?'}, lock=${ageSeconds}s`
    } catch (error) {
      if (error?.code === 'ENOENT' || error instanceof SyntaxError) return ''
      throw error
    }
  }

  async #retirarBloqueoAbandonado(lockPath) {
    let stat
    let owner
    try {
      const ownerPath = path.join(lockPath, 'owner.json')
      try {
        stat = await fs.promises.stat(ownerPath)
        owner = JSON.parse(await fs.promises.readFile(ownerPath, 'utf8'))
      } catch (error) {
        if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
        stat = await fs.promises.stat(lockPath)
      }
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }
    if (Date.now() - stat.mtimeMs < 120_000) return

    console.warn(
      `[db] Recuperando bloqueo SQLite sin heartbeat durante ` +
      `${Math.round((Date.now() - stat.mtimeMs) / 1000)}s ` +
      `(pid=${owner?.pid ?? '?'}, host=${owner?.host ?? '?'}); se validará el token antes de guardar.`
    )
    await fs.promises.rm(lockPath, { recursive: true, force: true })
  }

  async #renovarBloqueo(lockPath, token) {
    const ownerPath = path.join(lockPath, 'owner.json')
    const owner = JSON.parse(await fs.promises.readFile(ownerPath, 'utf8'))
    if (owner.token !== token) {
      throw new Error('El token del propietario cambió.')
    }
    const ahora = new Date()
    await fs.promises.utimes(ownerPath, ahora, ahora)
  }

  async #verificarPropietario(lockPath, token) {
    if (typeof token !== 'string') throw new TypeError('Se requiere el token del bloqueo para guardar.')
    let owner
    try {
      owner = JSON.parse(await fs.promises.readFile(path.join(lockPath, 'owner.json'), 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT') {
        const perdido = new Error(`Se perdió el bloqueo SQLite antes de guardar: ${lockPath}`)
        perdido.code = 'ERR_SQLITE_LOCK_LOST'
        throw perdido
      }
      throw error
    }
    if (owner.token !== token) {
      const perdido = new Error(`Cambió el propietario del bloqueo SQLite antes de guardar: ${lockPath}`)
      perdido.code = 'ERR_SQLITE_LOCK_LOST'
      throw perdido
    }
  }

  async #liberarBloqueo(lockPath, token) {
    if (typeof token !== 'string') throw new TypeError('Se requiere el token del bloqueo para liberarlo.')
    let owner
    try {
      owner = JSON.parse(await fs.promises.readFile(path.join(lockPath, 'owner.json'), 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT') return false
      throw error
    }
    if (owner.token !== token) {
      console.warn(`[db] No se liberó ${lockPath}: el token del propietario cambió.`)
      return false
    }
    await fs.promises.rm(lockPath, { recursive: true, force: true })
    return true
  }
}
