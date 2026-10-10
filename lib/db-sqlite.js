import fs from 'node:fs'
import path from 'node:path'
import sqlite3 from 'sqlite3'
const CONTADORES_ADITIVOS = new Set(['msgCount', 'commandCount', 'stickerCount', 'level', 'comisionEnviada', 'comisionRecibida'])

// Una fila por colección pequeña y una fila por entidad (usuario, chat) en
// las colecciones grandes. Así cada write/refresh mueve solo lo que cambió:
// revisiones baratas para detectar, payloads mínimos en cada transacción y
// locks de milisegundos en vez de segundos.
const TABLA_COLECCIONES = 'bot_collections'
const TABLA_ENTIDADES = 'bot_entidades'
const TABLA_REVS = 'bot_coleccion_revs'
const TABLA_BLOB_LEGADA = 'bot_state'
// Colecciones fragmentadas (una fila por clave). El resto va en una sola fila.
const FRAGMENTADAS = new Set(['users', 'chats'])
// Clave solo en memoria: nunca se persiste (igual que antes).
const CLAVE_SOLO_MEMORIA = 'spamCount'
// Tamaño de lote para consultas IN (límite de variables de SQLite).
const LOTE_IN = 500

function clonar(valor) {
  if (valor === undefined) return undefined
  return JSON.parse(JSON.stringify(valor))
}

function esObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
}

function mismoValor(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function combinarCambios(
  base,
  local,
  actual,
  clave = '',
  clavePadre = '',
  resolverConflicto = null,
  ruta = []
) {
  if (mismoValor(base, local)) return actual

  const rutaActual = clave ? [...ruta, clave] : ruta
  const esContadorPlugin = rutaActual[0] === 'stats' &&
    rutaActual.length === 3 &&
    (clave === 'total' || clave === 'success')
  if (
    (CONTADORES_ADITIVOS.has(clave) || esContadorPlugin || clave === 'exp' || clavePadre === 'msgByChat') &&
    Number.isFinite(base) &&
    Number.isFinite(local) &&
    Number.isFinite(actual) &&
    (clave === 'exp' || local >= base)
  ) {
    return actual + (local - base)
  }

  if (esObjeto(local) && (esObjeto(base) || base === undefined)) {
    // actual is a freshly parsed SQLite snapshot; reuse unchanged branches.
    const destino = esObjeto(actual) ? { ...actual } : {}
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
      const rutaPropiedad = [...ruta, clave, propiedad]
      const esTiempoPlugin = rutaPropiedad[0] === 'stats' &&
        rutaPropiedad.length === 3 &&
        (propiedad === 'last' || propiedad === 'lastSuccess')
      if (
        (propiedad === 'lastMsgAt' || esTiempoPlugin) &&
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
        resolverConflicto,
        rutaActual
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

// Normaliza un valor para comparar/persistir (misma normalización que
// JSON.parse(JSON.stringify())) sin romper con undefined.
function normalizarColeccion(valor) {
  const texto = typeof valor === 'undefined' ? 'null' : JSON.stringify(valor)
  return JSON.parse(texto ?? 'null')
}

// Parte una lista grande en lotes para cláusulas IN.
function porLotes(lista, tamano = LOTE_IN) {
  const lotes = []
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano))
  return lotes
}

function envolverConflicto(filename, error) {
  if (error?.code === 'ERR_SQLITE_WRITE_CONFLICT') throw error
  const conflicto = new Error(
    `Conflicto SQLite en ${filename}; se rechazó la escritura para proteger los datos.`,
    { cause: error }
  )
  conflicto.code = 'ERR_SQLITE_WRITE_CONFLICT'
  throw conflicto
}

export class ArchivoSqliteCompartido {
  constructor(filename, legacyFilename, {
    lockTimeoutMs = 30_000,
    persistConnections = false,
    refreshMinIntervalMs = 0,
  } = {}) {
    this.filename = filename
    this.legacyFilename = legacyFilename
    this.claimsFilename = `${filename}.claims.sqlite`
    this.lockTimeoutMs = lockTimeoutMs
    this.persistConnections = persistConnections
    this.refreshMinIntervalMs = refreshMinIntervalMs
    // Baselines y revisiones. Colección simple: valor directo.
    // Colección fragmentada (users/chats): mapa id -> valor.
    this.baseline = null
    this.baselineStr = {}
    this.revision = {}
    // Contador de cambios por colección fragmentada.
    this.collRev = {}
    this.lastRefreshCheckAt = 0
    this.refreshPromise = null
    this.writeChain = Promise.resolve()
    this.connectionQueues = new Map()
    this.connections = new Map()
    this.ensurePromise = null
    this.ensureClaimsPromise = null
    this.closePromise = null
  }

  #baseDe(clave, id = null) {
    if (id === null) {
      return Object.prototype.hasOwnProperty.call(this.baseline || {}, clave)
        ? this.baseline[clave]
        : undefined
    }
    const mapa = this.baseline?.[clave]
    return mapa && Object.prototype.hasOwnProperty.call(mapa, id) ? mapa[id] : undefined
  }

  async read() {
    await this.#asegurarDb()
    const filas = await this.#conConexion(
      this.filename,
      (db) => consultarTodos(db, `SELECT key, payload, revision FROM ${TABLA_COLECCIONES}`)
    )
    const entidades = await this.#conConexion(
      this.filename,
      (db) => consultarTodos(
        db,
        `SELECT collection, id, data, revision FROM ${TABLA_ENTIDADES}`
      )
    )
    const revs = await this.#conConexion(
      this.filename,
      (db) => consultarTodos(db, `SELECT collection, revision FROM ${TABLA_REVS}`)
    )
    const datos = {}
    const baseline = {}
    const baselineStr = {}
    const revision = {}
    for (const fila of filas) {
      const valor = JSON.parse(fila.payload)
      datos[fila.key] = valor
      baseline[fila.key] = clonar(valor)
      baselineStr[fila.key] = fila.payload
      revision[fila.key] = Number(fila.revision)
    }
    for (const fila of entidades) {
      const valor = JSON.parse(fila.data)
      if (!esObjeto(datos[fila.collection])) {
        datos[fila.collection] = {}
        baseline[fila.collection] = {}
        baselineStr[fila.collection] = {}
        revision[fila.collection] = {}
      }
      datos[fila.collection][fila.id] = valor
      baseline[fila.collection][fila.id] = clonar(valor)
      baselineStr[fila.collection][fila.id] = fila.data
      revision[fila.collection][fila.id] = Number(fila.revision)
    }
    const collRev = {}
    for (const fila of revs) collRev[fila.collection] = Number(fila.revision)
    // Las colecciones fragmentadas vacías no tienen filas de entidad: la
    // fila de revisiones atestigua que existen y se reconstruyen como {}.
    for (const coll of FRAGMENTADAS) {
      if (Object.prototype.hasOwnProperty.call(collRev, coll) && !esObjeto(datos[coll])) {
        datos[coll] = {}
        baseline[coll] = {}
        baselineStr[coll] = {}
        revision[coll] = {}
      }
    }
    this.baseline = baseline
    this.baselineStr = baselineStr
    this.revision = revision
    this.collRev = collRev
    return clonar(datos)
  }

  write(datosVivos) {
    if (datosVivos == null) return Promise.resolve()
    const operation = this.writeChain.then(() => this.#escribir(datosVivos))
    this.writeChain = operation.catch(() => {})
    return operation
  }

  async refresh(datosVivos) {
    if (!esObjeto(datosVivos)) throw new TypeError('No hay datos cargados para sincronizar.')
    await this.#asegurarDb()
    if (this.refreshPromise) return this.refreshPromise
    if (Date.now() - this.lastRefreshCheckAt < this.refreshMinIntervalMs) return datosVivos
    const operation = this.#actualizarVista(datosVivos)
    this.refreshPromise = operation
    try {
      return await operation
    } finally {
      this.lastRefreshCheckAt = Date.now()
      if (this.refreshPromise === operation) this.refreshPromise = null
    }
  }

  async #actualizarVista(datosVivos) {
    if (!this.baseline) await this.read()
    // Chequeo barato: solo claves y revisiones, sin payloads.
    const revs = await this.#conConexion(this.filename, (db) => consultarTodos(
      db, `SELECT key, revision FROM ${TABLA_COLECCIONES}`
    ))
    const revsColl = await this.#conConexion(this.filename, (db) => consultarTodos(
      db, `SELECT collection, revision FROM ${TABLA_REVS}`
    ))
    const revisionRemota = new Map(revs.map((fila) => [fila.key, Number(fila.revision)]))
    const collRemota = new Map(revsColl.map((fila) => [fila.collection, Number(fila.revision)]))
    let conflictos = 0
    const resolver = (_base, _local, confirmado) => {
      conflictos++
      return clonar(confirmado)
    }

    // 1) Colecciones simples que cambiaron.
    const cambiadas = []
    for (const [clave, rev] of revisionRemota) {
      if (clave === CLAVE_SOLO_MEMORIA || FRAGMENTADAS.has(clave)) continue
      if (!(clave in this.revision) || this.revision[clave] !== rev) cambiadas.push(clave)
    }
    for (const clave of Object.keys(this.revision)) {
      if (clave === CLAVE_SOLO_MEMORIA || FRAGMENTADAS.has(clave)) continue
      if (!revisionRemota.has(clave) && typeof this.revision[clave] === 'number') cambiadas.push(clave)
    }
    if (cambiadas.length) {
      const confirmadas = new Map()
      for (const lote of porLotes(cambiadas)) {
        const placeholders = lote.map(() => '?').join(',')
        const filas = await this.#conConexion(this.filename, (db) => consultarTodos(
          db,
          `SELECT key, payload, revision FROM ${TABLA_COLECCIONES} WHERE key IN (${placeholders})`,
          lote
        ))
        for (const fila of filas) confirmadas.set(fila.key, fila)
      }
      for (const clave of cambiadas) {
        const fila = confirmadas.get(clave)
        const base = this.#baseDe(clave)
        const local = Object.prototype.hasOwnProperty.call(datosVivos, clave)
          ? normalizarColeccion(datosVivos[clave])
          : undefined
        if (!fila) {
          if (local === undefined || mismoValor(base, local)) {
            delete datosVivos[clave]
            delete this.baseline[clave]
            delete this.baselineStr[clave]
            delete this.revision[clave]
          }
          continue
        }
        const actual = JSON.parse(fila.payload)
        const combinado = combinarCambios(base, local, actual, clave, '', resolver)
        if (combinado === undefined) delete datosVivos[clave]
        else datosVivos[clave] = combinado
        this.baseline[clave] = clonar(actual)
        this.baselineStr[clave] = fila.payload
        this.revision[clave] = Number(fila.revision)
      }
    }

    // 2) Colecciones fragmentadas cuyo contador cambió: se revisa por entidad.
    for (const coll of FRAGMENTADAS) {
      const remota = collRemota.get(coll)
      if (remota === undefined || remota === this.collRev[coll]) continue
      await this.#conConexion(this.filename, async (db) => {
        const filas = await consultarTodos(
          db,
          `SELECT id, revision FROM ${TABLA_ENTIDADES} WHERE collection = ?`,
          [coll]
        )
        const revsRemotas = new Map(filas.map((fila) => [fila.id, Number(fila.revision)]))
        const conocidas = this.revision[coll] || {}
        const pedir = []
        for (const [id, rev] of revsRemotas) {
          if (conocidas[id] !== rev) pedir.push(id)
        }
        const baseColl = this.baseline[coll] || {}
        const faltantes = Object.keys(baseColl).filter((id) => !revsRemotas.has(id))
        if (esObjeto(datosVivos[coll]) === false) datosVivos[coll] = {}
        if (pedir.length) {
          const cargadas = new Map()
          for (const lote of porLotes(pedir)) {
            const placeholders = lote.map(() => '?').join(',')
            const datos = await consultarTodos(
              db,
              `SELECT id, data, revision FROM ${TABLA_ENTIDADES} WHERE collection = ? AND id IN (${placeholders})`,
              [coll, ...lote]
            )
            for (const fila of datos) cargadas.set(fila.id, fila)
          }
          for (const id of pedir) {
            const fila = cargadas.get(id)
            if (!fila) continue
            const base = Object.prototype.hasOwnProperty.call(baseColl, id) ? baseColl[id] : undefined
            const local = Object.prototype.hasOwnProperty.call(datosVivos[coll], id)
              ? normalizarColeccion(datosVivos[coll][id])
              : undefined
            const actual = JSON.parse(fila.data)
            const combinado = combinarCambios(base, local, actual, id, '', resolver)
            if (combinado === undefined) delete datosVivos[coll][id]
            else datosVivos[coll][id] = combinado
            if (!esObjeto(this.baseline[coll])) {
              this.baseline[coll] = {}
              this.baselineStr[coll] = {}
              this.revision[coll] = {}
            }
            this.baseline[coll][id] = clonar(actual)
            this.baselineStr[coll][id] = fila.data
            this.revision[coll][id] = Number(fila.revision)
          }
        }
        for (const id of faltantes) {
          const local = Object.prototype.hasOwnProperty.call(datosVivos[coll], id)
            ? datosVivos[coll][id]
            : undefined
          if (local === undefined || mismoValor(baseColl[id], local)) {
            delete datosVivos[coll]?.[id]
            delete this.baseline[coll]?.[id]
            delete this.baselineStr[coll]?.[id]
            delete this.revision[coll]?.[id]
          }
        }
        // La colección existe en disco pero está vacía (o quedó vacía): se
        // adopta como {} si este proceso aún no la conoce.
        if (!esObjeto(datosVivos[coll]) && !esObjeto(this.baseline[coll])) {
          datosVivos[coll] = {}
          this.baseline[coll] = {}
          this.baselineStr[coll] = {}
          this.revision[coll] = {}
        }
      })
      this.collRev[coll] = remota
    }

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
      throw new TypeError('Los datos, reclamo, duración y actualización deben ser válidas.')
    }
    await this.#asegurarDb()
    const resultado = await this.#transaccion(this.filename, async (db) => {
      if (!this.baseline) {
        const cargado = await this.#cargarTodo(db)
        this.baseline = cargado.baseline
        this.baselineStr = cargado.baselineStr
        this.revision = cargado.revision
        this.collRev = cargado.collRev
      }
      // Solo revisiones (sin payloads): lo que no se movió no se carga.
      const revs = await consultarTodos(db, `SELECT key, revision FROM ${TABLA_COLECCIONES}`)
      const revsColl = await consultarTodos(db, `SELECT collection, revision FROM ${TABLA_REVS}`)
      const revSimple = new Map(revs.map((fila) => [fila.key, Number(fila.revision)]))
      const revFrag = new Map(revsColl.map((fila) => [fila.collection, Number(fila.revision)]))
      // vistos: estado del disco por unidad (para persistir sin releer).
      const vistos = { simples: new Map(), ents: new Map() }
      const datos = {}

      const unidadSimple = async (clave) => {
        const revD = revSimple.get(clave)
        const revB = this.revision[clave]
        const base = this.#baseDe(clave)
        const enVivo = Object.prototype.hasOwnProperty.call(datosVivos, clave)
        const local = enVivo ? normalizarColeccion(datosVivos[clave]) : undefined
        if (revD !== undefined && revD === revB && typeof revB === 'number') {
          const valor = combinarCambios(base, local, clonar(base), clave, '')
          vistos.simples.set(clave, { str: this.baselineStr[clave], rev: revB, existe: true })
          return valor
        }
        const fila = await consultar(
          db, `SELECT payload, revision FROM ${TABLA_COLECCIONES} WHERE key = ?`, [clave]
        )
        const actual = fila ? JSON.parse(fila.payload) : undefined
        const valor = combinarCambios(base, local, actual, clave, '')
        vistos.simples.set(clave, {
          str: fila?.payload,
          rev: Number(fila?.revision ?? 0),
          existe: Boolean(fila),
        })
        return valor
      }

      const clavesSimples = new Set([
        ...Object.keys(datosVivos),
        ...revSimple.keys(),
        ...Object.keys(this.baseline),
      ])
      for (const clave of clavesSimples) {
        if (clave === CLAVE_SOLO_MEMORIA || FRAGMENTADAS.has(clave)) continue
        const valor = await unidadSimple(clave)
        if (valor !== undefined) datos[clave] = valor
      }

      for (const coll of FRAGMENTADAS) {
        const revD = revFrag.get(coll)
        const mapa = {}
        const vistosColl = new Map()
        vistos.ents.set(coll, vistosColl)
        const baseColl = esObjeto(this.baseline[coll]) ? this.baseline[coll] : {}
        const baseStrColl = esObjeto(this.baselineStr[coll]) ? this.baselineStr[coll] : {}
        const revColl = esObjeto(this.revision[coll]) ? this.revision[coll] : {}
        const liveColl = esObjeto(datosVivos[coll]) ? datosVivos[coll] : {}
        if (revD !== undefined && revD === this.collRev[coll]) {
          for (const id of new Set([...Object.keys(baseColl), ...Object.keys(liveColl)])) {
            const base = Object.prototype.hasOwnProperty.call(baseColl, id) ? baseColl[id] : undefined
            const local = Object.prototype.hasOwnProperty.call(liveColl, id)
              ? normalizarColeccion(liveColl[id])
              : undefined
            const valor = combinarCambios(base, local, clonar(base), id, '')
            if (valor !== undefined) mapa[id] = valor
            vistosColl.set(id, { str: baseStrColl[id], rev: revColl[id] ?? 0, existe: true })
          }
        } else {
          const filas = await consultarTodos(
            db, `SELECT id, revision FROM ${TABLA_ENTIDADES} WHERE collection = ?`, [coll]
          )
          const revsRemotas = new Map(filas.map((fila) => [fila.id, Number(fila.revision)]))
          const ids = new Set([...Object.keys(baseColl), ...Object.keys(liveColl), ...revsRemotas.keys()])
          const porPedir = [...ids].filter((id) => {
            const revB = revColl[id]
            const revR = revsRemotas.get(id)
            return !(revR !== undefined && revR === revB && typeof revB === 'number')
          })
          const cargadas = new Map()
          for (const lote of porLotes(porPedir)) {
            if (!lote.length) continue
            const placeholders = lote.map(() => '?').join(',')
            const datosFila = await consultarTodos(
              db,
              `SELECT id, data, revision FROM ${TABLA_ENTIDADES} WHERE collection = ? AND id IN (${placeholders})`,
              [coll, ...lote]
            )
            for (const fila of datosFila) cargadas.set(fila.id, fila)
          }
          for (const id of ids) {
            const base = Object.prototype.hasOwnProperty.call(baseColl, id) ? baseColl[id] : undefined
            const local = Object.prototype.hasOwnProperty.call(liveColl, id)
              ? normalizarColeccion(liveColl[id])
              : undefined
            const fila = cargadas.get(id)
            const presente = revsRemotas.has(id)
            let actual
            let str
            let rev
            if (fila) {
              actual = JSON.parse(fila.data)
              str = fila.data
              rev = Number(fila.revision)
            } else if (presente) {
              const directa = await consultar(
                db, `SELECT data, revision FROM ${TABLA_ENTIDADES} WHERE collection = ? AND id = ?`,
                [coll, id]
              )
              actual = directa ? JSON.parse(directa.data) : undefined
              str = directa?.data
              rev = Number(directa?.revision ?? 0)
            } else {
              actual = undefined
              str = undefined
              rev = 0
            }
            const valor = combinarCambios(base, local, actual, id, '')
            if (valor !== undefined) mapa[id] = valor
            vistosColl.set(id, { str, rev, existe: presente })
          }
        }
        datos[coll] = mapa
      }

      const ahora = Date.now()
      const result = update(datos, ahora)
      if (result && typeof result.then === 'function') {
        throw new TypeError('La actualización económica debe ser síncrona dentro de la transacción.')
      }
      if (result?.claim === false) return { acquired: true, result }

      const revisiones = {}
      const collRevs = {}
      // Persistencia selectiva con lo ya visto (sin releer el disco).
      for (const clave of Object.keys(datos)) {
        if (clave === CLAVE_SOLO_MEMORIA || FRAGMENTADAS.has(clave)) continue
        const visto = vistos.simples.get(clave)
        const texto = JSON.stringify(datos[clave])
        if (visto?.existe && visto.str === texto) {
          revisiones[clave] = visto.rev
          continue
        }
        await this.#guardarColeccion(db, clave, datos[clave])
        const filaNueva = await consultar(
          db, `SELECT revision FROM ${TABLA_COLECCIONES} WHERE key = ?`, [clave]
        )
        revisiones[clave] = Number(filaNueva?.revision ?? 0)
      }
      for (const [clave, visto] of vistos.simples) {
        if (Object.prototype.hasOwnProperty.call(datos, clave)) continue
        if (visto.existe) {
          await ejecutar(db, `DELETE FROM ${TABLA_COLECCIONES} WHERE key = ?`, [clave])
        }
      }
      for (const coll of FRAGMENTADAS) {
        if (!Object.prototype.hasOwnProperty.call(datos, coll)) continue
        const mapa = esObjeto(datos[coll]) ? datos[coll] : {}
        const vistosColl = vistos.ents.get(coll)
        let toco = false
        const escritos = []
        for (const id of Object.keys(mapa)) {
          const visto = vistosColl.get(id)
          const texto = JSON.stringify(mapa[id])
          if (visto?.existe && visto.str === texto) continue
          await this.#guardarEntidad(db, coll, id, mapa[id])
          toco = true
          escritos.push(id)
        }
        for (const [id, visto] of vistosColl) {
          if (Object.prototype.hasOwnProperty.call(mapa, id)) continue
          if (visto.existe) {
            await ejecutar(db, `DELETE FROM ${TABLA_ENTIDADES} WHERE collection = ? AND id = ?`, [coll, id])
            toco = true
          }
        }
        if (toco) {
          await this.#bumpCollRev(db, coll)
          const fila = await consultar(db, `SELECT revision FROM ${TABLA_REVS} WHERE collection = ?`, [coll])
          collRevs[coll] = Number(fila?.revision ?? 0)
        } else {
          collRevs[coll] = revFrag.get(coll) ?? this.collRev[coll] ?? 0
        }
      }
      // Revisiones finales por entidad: las no tocadas conservan la vista,
      // las escritas se releen (lotes pequeños, solo esas).
      const revisionesEnt = {}
      for (const coll of FRAGMENTADAS) {
        if (!Object.prototype.hasOwnProperty.call(datos, coll)) continue
        const mapa = datos[coll]
        const vistosColl = vistos.ents.get(coll)
        const releer = []
        for (const id of Object.keys(mapa)) {
          const visto = vistosColl.get(id)
          if (visto?.existe && visto.str === JSON.stringify(mapa[id])) {
            revisionesEnt[`${coll}\0${id}`] = visto.rev
          } else {
            releer.push(id)
          }
        }
        for (const lote of porLotes(releer)) {
          if (!lote.length) continue
          const placeholders = lote.map(() => '?').join(',')
          const filas = await consultarTodos(
            db,
            `SELECT id, revision FROM ${TABLA_ENTIDADES} WHERE collection = ? AND id IN (${placeholders})`,
            [coll, ...lote]
          )
          for (const fila of filas) revisionesEnt[`${coll}\0${fila.id}`] = Number(fila.revision)
        }
      }
      return { acquired: true, result, datos, revisiones, collRevs, revisionesEnt }
    })
    if (!resultado.datos) return resultado
    for (const clave of Object.keys(resultado.datos)) {
      if (FRAGMENTADAS.has(clave)) {
        if (!esObjeto(this.baseline[clave])) {
          this.baseline[clave] = {}
          this.baselineStr[clave] = {}
          this.revision[clave] = {}
        }
        for (const id of Object.keys(this.baseline[clave])) {
          if (Object.prototype.hasOwnProperty.call(resultado.datos[clave], id)) continue
          delete this.baseline[clave][id]
          delete this.baselineStr[clave][id]
          delete this.revision[clave][id]
        }
        for (const id of Object.keys(resultado.datos[clave])) {
          this.baseline[clave][id] = clonar(resultado.datos[clave][id])
          this.baselineStr[clave][id] = JSON.stringify(resultado.datos[clave][id])
          this.revision[clave][id] = resultado.revisionesEnt?.[`${clave}\0${id}`]
            ?? this.revision[clave][id] ?? 0
        }
        if (resultado.collRevs?.[clave] !== undefined) this.collRev[clave] = resultado.collRevs[clave]
      } else if (clave !== CLAVE_SOLO_MEMORIA) {
        this.baseline[clave] = clonar(resultado.datos[clave])
        this.baselineStr[clave] = JSON.stringify(resultado.datos[clave])
        this.revision[clave] = resultado.revisiones[clave] ?? this.revision[clave] ?? 0
      }
    }
    for (const clave of Object.keys(this.baseline)) {
      if (clave === CLAVE_SOLO_MEMORIA || FRAGMENTADAS.has(clave)) continue
      if (Object.prototype.hasOwnProperty.call(resultado.datos, clave)) continue
      delete this.baseline[clave]
      delete this.baselineStr[clave]
      delete this.revision[clave]
    }
    // spamCount vive solo en memoria: se reintegra antes de conciliar para
    // que actualizarObjetoVivo no lo elimine del objeto vivo.
    const spamEnMemoria = Object.prototype.hasOwnProperty.call(datosVivos, CLAVE_SOLO_MEMORIA)
      ? clonar(datosVivos[CLAVE_SOLO_MEMORIA])
      : undefined
    if (spamEnMemoria !== undefined) resultado.datos[CLAVE_SOLO_MEMORIA] = spamEnMemoria
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

  close() {
    if (this.closePromise) return this.closePromise
    this.closePromise = this.#cerrarConexiones()
    return this.closePromise
  }

  async #cerrarConexiones() {
    await this.writeChain
    await Promise.all([...this.connectionQueues.values()])
    const conexiones = [...this.connections.values()]
    this.connections.clear()
    await Promise.all(conexiones.map(cerrarSqlite))
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
        const importado = JSON.parse(original.toString('utf8'))
        if (esObjeto(importado)) {
          const { [CLAVE_SOLO_MEMORIA]: _ignorado, ...resto } = importado
          datos = resto
        }
      } catch (readError) {
        if (readError?.code !== 'ENOENT' || original) throw readError
      }
    }

    const db = await this.#abrirConWAL(this.filename)
    try {
      await this.#transaccionConDb(db, async () => {
        await ejecutarLote(db, `
          CREATE TABLE IF NOT EXISTS ${TABLA_COLECCIONES} (
            key TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            revision INTEGER NOT NULL DEFAULT 0
          )
        `)
        await ejecutarLote(db, `
          CREATE TABLE IF NOT EXISTS ${TABLA_ENTIDADES} (
            collection TEXT NOT NULL,
            id TEXT NOT NULL,
            data TEXT NOT NULL,
            revision INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (collection, id)
          )
        `)
        await ejecutarLote(db, `
          CREATE TABLE IF NOT EXISTS ${TABLA_REVS} (
            collection TEXT PRIMARY KEY,
            revision INTEGER NOT NULL DEFAULT 0
          )
        `)
        // Migración del formato anterior (un solo JSON en bot_state id=1 y/o
        // una fila por colección): se parte por entidad y se elimina la fila
        // legada. Es idempotente (INSERT OR IGNORE).
        const tablaLegada = await consultar(
          db,
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${TABLA_BLOB_LEGADA}'`
        )
        if (tablaLegada) {
          const legada = await consultar(db, `SELECT payload FROM ${TABLA_BLOB_LEGADA} WHERE id = 1`)
          if (legada?.payload) {
            const documento = leerEstado(legada.payload, this.filename)
            await this.#volcarDoc(db, documento, true)
          }
          await ejecutarLote(db, `DELETE FROM ${TABLA_BLOB_LEGADA} WHERE id = 1`)
        }
        const filasPrevias = await consultarTodos(db, `SELECT key FROM ${TABLA_COLECCIONES}`)
        const previas = new Set(filasPrevias.map((fila) => fila.key))
        for (const coll of FRAGMENTADAS) {
          if (!previas.has(coll)) continue
          const fila = await consultar(db, `SELECT payload FROM ${TABLA_COLECCIONES} WHERE key = ?`, [coll])
          if (fila?.payload) {
            const mapa = JSON.parse(fila.payload)
            if (esObjeto(mapa)) {
              for (const [id, valor] of Object.entries(mapa)) {
                await ejecutar(
                  db,
                  `INSERT OR IGNORE INTO ${TABLA_ENTIDADES} (collection, id, data, revision) VALUES (?, ?, ?, 1)`,
                  [coll, id, JSON.stringify(valor)]
                )
              }
              await ejecutar(
                db,
                `INSERT OR IGNORE INTO ${TABLA_REVS} (collection, revision) VALUES (?, 1)`,
                [coll]
              )
            }
          }
          await ejecutar(db, `DELETE FROM ${TABLA_COLECCIONES} WHERE key = ?`, [coll])
        }
        if (Object.keys(datos).length) {
          await this.#volcarDoc(db, datos, true)
        }
      })
      const filas = await consultarTodos(db, `SELECT payload FROM ${TABLA_COLECCIONES}`)
      for (const fila of filas) JSON.parse(fila.payload)
      const entidades = await consultarTodos(db, `SELECT data FROM ${TABLA_ENTIDADES}`)
      for (const fila of entidades) JSON.parse(fila.data)
    } finally {
      await cerrarSqlite(db)
    }
  }

  // Vuelca un documento completo en el esquema actual (migraciones).
  async #volcarDoc(db, documento, orIgnore = false) {
    const operador = orIgnore ? 'INSERT OR IGNORE INTO' : 'INSERT INTO'
    for (const [clave, valor] of Object.entries(documento)) {
      if (clave === CLAVE_SOLO_MEMORIA) continue
      if (FRAGMENTADAS.has(clave) && esObjeto(valor)) {
        for (const [id, entidad] of Object.entries(valor)) {
          await ejecutar(
            db,
            `${operador} ${TABLA_ENTIDADES} (collection, id, data, revision) VALUES (?, ?, ?, 1)`,
            [clave, id, JSON.stringify(entidad)]
          )
        }
        await ejecutar(
          db,
          `${operador} ${TABLA_REVS} (collection, revision) VALUES (?, 1)`,
          [clave]
        )
        continue
      }
      await ejecutar(
        db,
        `${operador} ${TABLA_COLECCIONES} (key, payload, revision) VALUES (?, ?, 1)`,
        [clave, JSON.stringify(valor)]
      )
    }
  }

  // Carga todo el estado dentro de una transacción en curso.
  async #cargarTodo(db) {
    const filas = await consultarTodos(db, `SELECT key, payload, revision FROM ${TABLA_COLECCIONES}`)
    const entidades = await consultarTodos(db, `SELECT collection, id, data, revision FROM ${TABLA_ENTIDADES}`)
    const revs = await consultarTodos(db, `SELECT collection, revision FROM ${TABLA_REVS}`)
    const datos = {}
    const baseline = {}
    const baselineStr = {}
    const revision = {}
    for (const fila of filas) {
      if (fila.key === CLAVE_SOLO_MEMORIA || FRAGMENTADAS.has(fila.key)) continue
      const valor = JSON.parse(fila.payload)
      datos[fila.key] = valor
      baseline[fila.key] = clonar(valor)
      baselineStr[fila.key] = fila.payload
      revision[fila.key] = Number(fila.revision)
    }
    for (const fila of entidades) {
      if (!FRAGMENTADAS.has(fila.collection)) continue
      const valor = JSON.parse(fila.data)
      if (!esObjeto(datos[fila.collection])) {
        datos[fila.collection] = {}
        baseline[fila.collection] = {}
        baselineStr[fila.collection] = {}
        revision[fila.collection] = {}
      }
      datos[fila.collection][fila.id] = valor
      baseline[fila.collection][fila.id] = clonar(valor)
      baselineStr[fila.collection][fila.id] = fila.data
      revision[fila.collection][fila.id] = Number(fila.revision)
    }
    const collRev = {}
    for (const fila of revs) collRev[fila.collection] = Number(fila.revision)
    for (const coll of FRAGMENTADAS) {
      if (Object.prototype.hasOwnProperty.call(collRev, coll) && !esObjeto(datos[coll])) {
        datos[coll] = {}
        baseline[coll] = {}
        baselineStr[coll] = {}
        revision[coll] = {}
      }
    }
    return { datos, baseline, baselineStr, revision, collRev }
  }

  async #escribir(datosVivos) {
    if (!this.baseline) await this.read()
    const sucias = this.#detectarSucias(datosVivos)
    const suciasEnt = this.#detectarSuciasEnt(datosVivos)
    const claves = Object.keys(sucias)
    const collsSucias = Object.keys(suciasEnt).filter((coll) => suciasEnt[coll].size > 0)
    if (!claves.length && !collsSucias.length) {
      await this.refresh(datosVivos)
      return
    }
    const escritas = {}
    const escritasEnt = {}
    const revisiones = {}
    const collRevs = {}
    await this.#asegurarDb()
    await this.#transaccion(this.filename, async (db) => {
      if (claves.length) {
        const actuales = new Map()
        for (const lote of porLotes(claves)) {
          const placeholders = lote.map(() => '?').join(',')
          const filas = await consultarTodos(
            db,
            `SELECT key, payload, revision FROM ${TABLA_COLECCIONES} WHERE key IN (${placeholders})`,
            lote
          )
          for (const fila of filas) actuales.set(fila.key, fila)
        }
        for (const clave of claves) {
          const fila = actuales.get(clave)
          const actual = fila ? JSON.parse(fila.payload) : undefined
          let combinado
          let combinadoDirecto = false
          // Atajo: si nadie más tocó la colección, el merge es identidad.
          if (fila && fila.payload === this.baselineStr[clave]) {
            combinado = sucias[clave]
            combinadoDirecto = true
          }
          if (!combinadoDirecto) {
            try {
              combinado = combinarCambios(this.baseline[clave], sucias[clave], actual, clave, '')
            } catch (error) {
              envolverConflicto(this.filename, error)
            }
          }
          if (!fila || !mismoValor(actual, combinado)) {
            await this.#guardarColeccion(db, clave, combinado)
            const filaNueva = await consultar(
              db,
              `SELECT revision FROM ${TABLA_COLECCIONES} WHERE key = ?`,
              [clave]
            )
            revisiones[clave] = Number(filaNueva?.revision ?? 0)
          } else {
            revisiones[clave] = Number(fila.revision)
          }
          escritas[clave] = combinado
        }
      }
      for (const coll of collsSucias) {
        const ids = [...suciasEnt[coll].keys()]
        const actuales = new Map()
        for (const lote of porLotes(ids)) {
          const placeholders = lote.map(() => '?').join(',')
          const filas = await consultarTodos(
            db,
            `SELECT id, data, revision FROM ${TABLA_ENTIDADES} WHERE collection = ? AND id IN (${placeholders})`,
            [coll, ...lote]
          )
          for (const fila of filas) actuales.set(fila.id, fila)
        }
        escritasEnt[coll] = {}
        let toco = false
        for (const id of ids) {
          const pedida = suciasEnt[coll].get(id)
          const fila = actuales.get(id)
          const actual = fila ? JSON.parse(fila.data) : undefined
          const base = this.#baseDe(coll, id)
          const local = pedida.existe ? pedida.valor : undefined
          let combinado
          let combinadoDirecto = false
          if (fila && fila.data === this.baselineStr[coll]?.[id]) {
            combinado = local
            combinadoDirecto = true
          }
          if (!combinadoDirecto) {
            try {
              combinado = combinarCambios(base, local, actual, id, '')
            } catch (error) {
              envolverConflicto(this.filename, error)
            }
          }
          const baseStr = this.baselineStr[coll]?.[id]
          if (combinado === undefined) {
            if (fila) {
              await ejecutar(
                db, `DELETE FROM ${TABLA_ENTIDADES} WHERE collection = ? AND id = ?`, [coll, id]
              )
              toco = true
            }
            delete escritasEnt[coll][id]
          } else {
            const texto = JSON.stringify(combinado)
            if (!fila || fila.data !== texto) {
              await this.#guardarEntidad(db, coll, id, combinado)
              toco = true
            }
            escritasEnt[coll][id] = combinado
          }
          if (!esObjeto(this.revision[coll])) this.revision[coll] = {}
          const filaNueva = fila && !toco
            ? fila
            : await consultar(
              db,
              `SELECT revision FROM ${TABLA_ENTIDADES} WHERE collection = ? AND id = ?`,
              [coll, id]
            )
          void baseStr
          if (combinado !== undefined) {
            this.revision[coll][id] = Number(filaNueva?.revision ?? this.revision[coll][id] ?? 0)
          } else {
            delete this.revision[coll][id]
          }
        }
        if (toco) {
          await this.#bumpCollRev(db, coll)
          const fila = await consultar(db, `SELECT revision FROM ${TABLA_REVS} WHERE collection = ?`, [coll])
          collRevs[coll] = Number(fila?.revision ?? 0)
        } else {
          collRevs[coll] = this.collRev[coll] ?? 0
        }
      }
    })

    for (const clave of claves) {
      let fusionado
      try {
        fusionado = combinarCambios(
          sucias[clave],
          normalizarColeccion(datosVivos[clave]),
          escritas[clave],
          clave,
          ''
        )
      } catch (error) {
        if (error?.code !== 'ERR_SQLITE_WRITE_CONFLICT') throw error
        fusionado = normalizarColeccion(datosVivos[clave])
      }
      if (fusionado === undefined) delete datosVivos[clave]
      else datosVivos[clave] = fusionado
      this.baseline[clave] = clonar(escritas[clave])
      this.baselineStr[clave] = JSON.stringify(escritas[clave])
      this.revision[clave] = revisiones[clave] ?? this.revision[clave] ?? 0
    }
    for (const coll of collsSucias) {
      if (!esObjeto(datosVivos[coll])) datosVivos[coll] = {}
      if (!esObjeto(this.baseline[coll])) {
        this.baseline[coll] = {}
        this.baselineStr[coll] = {}
        this.revision[coll] = {}
      }
      for (const id of Object.keys(escritasEnt[coll])) {
        let fusionado
        try {
          fusionado = combinarCambios(
            suciasEnt[coll].get(id)?.existe ? suciasEnt[coll].get(id).valor : undefined,
            normalizarColeccion(datosVivos[coll][id]),
            escritasEnt[coll][id],
            id,
            ''
          )
        } catch (error) {
          if (error?.code !== 'ERR_SQLITE_WRITE_CONFLICT') throw error
          fusionado = normalizarColeccion(datosVivos[coll][id])
        }
        if (fusionado === undefined) {
          delete datosVivos[coll][id]
          delete this.baseline[coll][id]
          delete this.baselineStr[coll][id]
          delete this.revision[coll][id]
        } else {
          datosVivos[coll][id] = fusionado
          this.baseline[coll][id] = clonar(escritasEnt[coll][id])
          this.baselineStr[coll][id] = JSON.stringify(escritasEnt[coll][id])
        }
      }
      // Entidades eliminadas localmente.
      for (const [id, pedida] of suciasEnt[coll]) {
        if (pedida.existe || escritasEnt[coll][id] !== undefined) continue
        delete datosVivos[coll][id]
        delete this.baseline[coll]?.[id]
        delete this.baselineStr[coll]?.[id]
        delete this.revision[coll]?.[id]
      }
      if (collRevs[coll] !== undefined) this.collRev[coll] = collRevs[coll]
    }
  }

  #detectarSucias(datosVivos) {
    const sucias = {}
    for (const clave of Object.keys(datosVivos)) {
      if (clave === CLAVE_SOLO_MEMORIA || FRAGMENTADAS.has(clave)) continue
      const normalizada = normalizarColeccion(datosVivos[clave])
      const texto = JSON.stringify(normalizada)
      if (!(clave in this.baselineStr) || this.baselineStr[clave] !== texto) {
        sucias[clave] = normalizada
      }
    }
    return sucias
  }

  // Mapa colección -> Map(id -> { existe, valor }) con lo que cambió.
  #detectarSuciasEnt(datosVivos) {
    const sucias = {}
    for (const coll of FRAGMENTADAS) {
      const mapa = new Map()
      const live = esObjeto(datosVivos[coll]) ? datosVivos[coll] : {}
      const baseStr = esObjeto(this.baselineStr[coll]) ? this.baselineStr[coll] : {}
      for (const id of Object.keys(live)) {
        const normalizado = normalizarColeccion(live[id])
        if (!(id in baseStr) || baseStr[id] !== JSON.stringify(normalizado)) {
          mapa.set(id, { existe: true, valor: normalizado })
        }
      }
      const base = esObjeto(this.baseline[coll]) ? this.baseline[coll] : {}
      for (const id of Object.keys(base)) {
        if (Object.prototype.hasOwnProperty.call(live, id)) continue
        mapa.set(id, { existe: false, valor: undefined })
      }
      sucias[coll] = mapa
    }
    return sucias
  }

  async #guardarColeccion(db, clave, valor) {
    await ejecutar(
      db,
      `INSERT INTO ${TABLA_COLECCIONES} (key, payload, revision) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, revision = ${TABLA_COLECCIONES}.revision + 1`,
      [clave, JSON.stringify(valor)]
    )
  }

  async #guardarEntidad(db, coll, id, valor) {
    await ejecutar(
      db,
      `INSERT INTO ${TABLA_ENTIDADES} (collection, id, data, revision) VALUES (?, ?, ?, 1)
       ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, revision = ${TABLA_ENTIDADES}.revision + 1`,
      [coll, id, JSON.stringify(valor)]
    )
  }

  async #bumpCollRev(db, coll) {
    await ejecutar(
      db,
      `INSERT INTO ${TABLA_REVS} (collection, revision) VALUES (?, 1)
       ON CONFLICT(collection) DO UPDATE SET revision = ${TABLA_REVS}.revision + 1`,
      [coll]
    )
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

  async #transaccion(filename, operation) {
    return this.#conConexion(
      filename,
      (db) => this.#transaccionConDb(db, () => operation(db)),
      'write'
    )
  }

  #conConexion(filename, operation, channel = 'read') {
    if (this.closePromise) {
      return Promise.reject(new Error(`La conexión SQLite ya se está cerrando: ${filename}`))
    }
    const connectionKey = `${filename}:${channel}`
    const anterior = this.connectionQueues.get(connectionKey) || Promise.resolve()
    const actual = anterior.then(async () => {
      let db = this.connections.get(connectionKey)
      if (!db) {
        db = await this.#abrirConWAL(filename)
        if (this.persistConnections) this.connections.set(connectionKey, db)
      }
      try {
        return await operation(db)
      } finally {
        if (!this.persistConnections) await cerrarSqlite(db)
      }
    })
    this.connectionQueues.set(connectionKey, actual.catch(() => {}))
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

  /**
   * Compacta el WAL contra el archivo principal. Con 6 procesos escribiendo
   * sin parar, el checkpoint pasivo nunca completa y el WAL crece (lecturas
   * cada vez más lentas). TRUNCATE lo deja en 0. Solo debe llamarlo UN proceso.
   */
  async checkpointWal(filename = this.filename) {
    await this.#asegurarDb()
    if (filename === this.claimsFilename) await this.#asegurarClaimsDb()
    const db = await abrirSqlite(filename, this.lockTimeoutMs)
    try {
      try {
        await ejecutar(db, 'PRAGMA journal_size_limit = 20971520')
      } catch {}
      return await consultar(db, 'PRAGMA wal_checkpoint(TRUNCATE)')
    } finally {
      await cerrarSqlite(db)
    }
  }
}
