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
const TABLA_ENTIDADES_BORRADAS = 'bot_entidades_borradas'
const TABLA_CURSOR = 'bot_cursor'
const TABLA_REVS = 'bot_coleccion_revs'
const TABLA_BLOB_LEGADA = 'bot_state'
// Nombre de la fila con el contador monotónico de entidades. Cada entidad
// escrita (y cada borrado) recibe un número creciente de esta secuencia, de
// modo que el refresh solo lee lo que cambió desde su último cursor en vez de
// recorrer TODAS las entidades en cada sincronización.
const CLAVE_CURSOR_ENTIDADES = 'entidades'
// Colecciones fragmentadas (una fila por clave). El resto va en una sola fila.
// `bienvenidas` crece con cada grupo (y puede llevar imágenes); guardarlo como
// un único JSON hacía que cada cambio costara cientos de ms.
const FRAGMENTADAS = new Set(['users', 'chats', 'bienvenidas'])
// Clave solo en memoria: nunca se persiste (igual que antes).
const CLAVE_SOLO_MEMORIA = 'spamCount'
// Tamaño de lote para consultas IN (límite de variables de SQLite).
const LOTE_IN = 500
// Cada cuántas entidades se cede el event-loop durante la detección de
// cambios. Serializar 50k usuarios de golpe congelaba el proceso ~150ms; con
// lotes, cada ráfaga es de pocos milisegundos.
const LOTE_DETECCION = 1000

function cederEventLoop() {
  return new Promise((resolve) => setImmediate(resolve))
}

function clonar(valor) {
  if (valor === undefined) return undefined
  return JSON.parse(JSON.stringify(valor))
}

function esObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
}

// No envolvemos binarios/fechas: los comandos los leen tal cual y un Proxy
// sobre ellos rompería APIs nativas.
function esObjetoProxiable(valor) {
  if (valor === null || typeof valor !== 'object') return false
  if (Buffer.isBuffer(valor)) return false
  if (ArrayBuffer.isView(valor)) return false
  if (valor instanceof Date || valor instanceof RegExp) return false
  if (valor instanceof Map || valor instanceof Set) return false
  if (valor instanceof Promise || valor instanceof Error) return false
  if (valor instanceof WeakMap || valor instanceof WeakSet) return false
  return true
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

// Concilia en el lugar el objeto vivo con el valor ya confirmado, en vez de
// reemplazar la referencia. Así los objetos que otros módulos tienen en la mano
// (un usuario, una colección) siguen siendo el mismo objeto tras un reclamo.
// Solo se recorre lo que el llamador acota; las hojas se copian.
function actualizarObjetoVivo(destino, origen) {
  if (!esObjeto(destino) || !esObjeto(origen)) return clonar(origen)
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
  return destino
}

function abrirSqlite(filename, busyTimeoutMs) {  return new Promise((resolve, reject) => {
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

const PROPIEDADES_IGNORADAS = new Set([
  'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
  'toString', 'valueOf', 'toJSON', 'inspect', 'constructor', '__proto__',
  'then', 'length', 'name', 'prototype'
])

function esClaveEntidad(id) {
  if (typeof id !== 'string' || !id) return false
  // Usuarios/chats se indexan por JID o número, pero también aceptamos claves
  // simples para datos históricos. Solo se excluyen propiedades del prototipo.
  return !PROPIEDADES_IGNORADAS.has(id)
}

export class ArchivoSqliteCompartido {
  constructor(filename, legacyFilename, {
    lockTimeoutMs = 30_000,
    persistConnections = false,
    refreshMinIntervalMs = 0,
    singleWriter = false,
  } = {}) {
    this.filename = filename
    this.legacyFilename = legacyFilename
    this.claimsFilename = `${filename}.claims.sqlite`
    this.lockTimeoutMs = lockTimeoutMs
    this.persistConnections = persistConnections
    this.refreshMinIntervalMs = refreshMinIntervalMs
    // En el proceso único no hay otro escritor: se puede omitir el SELECT de
    // revisión por entidad tras cada escritura (una query menos por fila).
    this.singleWriter = singleWriter === true
    // Última vista confirmada. Simple: string del payload. Fragmentada
    // (users/chats): mapa id -> string del payload. No se conserva una copia
    // parseada: se deriva por entidad solo cuando hace falta combinar, para no
    // duplicar en RAM todo el estado (users/chats) en cada proceso.
    this.baselineStr = {}
    this.revision = {}
    // ¿Ya se cargó la vista confirmada en este proceso?
    this.cargado = false
    // Contador de cambios por colección fragmentada.
    this.collRev = {}
    // Última secuencia de entidad ya conciliada en este proceso. El refresh
    // pide solo entidades/borrados con secuencia mayor.
    this.cursorSeq = 0
    this.lastRefreshCheckAt = 0
    this.refreshPromise = null
    this.writeChain = Promise.resolve()
    this.connectionQueues = new Map()
    this.connections = new Map()
    this.ensurePromise = null
    this.ensureClaimsPromise = null
    this.closePromise = null
    // ── Rastreo de cambios (sin escanear colecciones completas) ────────────
    // Fragmentadas: cada entidad se envuelve en un Proxy PROFUNDO que marca
    // solo cuando hay una mutación (set/delete). Leer no marca nada. Antes se
    // marcaba en cada lectura y, con muchos bots, el conjunto superaba el tope
    // y caía en escaneos completos de 20+ segundos.
    this.rastreados = new Map() // coll -> { proxy, target }
    this.proxiesEntidad = new Map() // coll -> WeakMap(raw -> proxy profundo)
    this.sucias = new Map() // coll -> Set(id)
    this.borradas = new Map() // coll -> Set(id)
    this.rastreadosSimples = new Map() // clave -> { proxy, target, cache }
    this.suciasColecciones = new Set()
    this.flushPendiente = null
    this.flushEnCurso = null
    this.fullScanNeeded = false
    this.datosVivos = null
    this.maxSucias = Math.max(
      2_000,
      Number.parseInt(process.env.PAIN_DB_MAX_DIRTY, 10) || 50_000
    )
    this.intervaloFlushMs = Math.min(
      Math.max(Number.parseInt(process.env.PAIN_DB_FLUSH_MS, 10) || 1_500, 250),
      60_000
    )
    // 0 = nunca. Con proxies de mutación no hace falta escanear todo; el
    // escaneo completo queda para arranques externos (tests/importaciones).
    this.intervaloFullScanMs = Math.max(
      Number.parseInt(process.env.PAIN_DB_FULL_SCAN_MS, 10) || 0,
      0
    )
    this.ultimoFullScan = 0
    this.estadisticas = {
      flushes: 0,
      entidades: 0,
      fullScans: 0,
      ultimoMs: 0,
      maxMs: 0,
      descartes: 0,
    }
  }

  /** Vincula el objeto vivo real (lowdb puede reemplazar la raíz al cargar). */
  vincularDatos(datos) {
    if (!esObjeto(datos)) return
    this.datosVivos = datos
    this.#instalarRastreadores(datos, { inicial: true })
  }

  /**
   * Instala proxies profundos en las colecciones fragmentadas y en las
   * colecciones simples. `inicial:true` no marca nada (los datos vienen de la
   * DB); en el resto, un objeto reemplazado se marca para persistirse.
   */
  #instalarRastreadores(datos = this.datosVivos, { inicial = false } = {}) {
    if (!esObjeto(datos)) return
    for (const coll of FRAGMENTADAS) {
      const actual = datos[coll]
      if (!esObjeto(actual)) continue
      const info = this.rastreados.get(coll)
      if (info?.proxy === actual) continue
      if (info?.target === actual) {
        datos[coll] = info.proxy
        continue
      }
      if (!inicial && info) this.fullScanNeeded = true
      const proxy = this.#crearProxyColeccion(coll, actual)
      this.rastreados.set(coll, { proxy, target: actual })
      datos[coll] = proxy
    }
    for (const clave of Object.keys(datos)) {
      if (clave === CLAVE_SOLO_MEMORIA || FRAGMENTADAS.has(clave)) continue
      const actual = datos[clave]
      if (!esObjetoProxiable(actual)) continue
      const info = this.rastreadosSimples.get(clave)
      if (info?.proxy === actual) continue
      if (info?.target === actual) {
        datos[clave] = info.proxy
        continue
      }
      if (!inicial) this.suciasColecciones.add(clave)
      const cache = new WeakMap()
      const proxy = this.#crearProxyProfundo(() => this.marcarColeccion(clave), actual, cache)
      this.rastreadosSimples.set(clave, { proxy, target: actual, cache })
      datos[clave] = proxy
    }
    this.datosVivos = datos
  }

  #crearProxyColeccion(coll, target) {
    const almacen = this
    let iterando = false
    return new Proxy(target, {
      ownKeys(objetivo) {
        // Object.entries/values/keys se usan para lecturas masivas (top,
        // cumpleaños, etc.). No creamos un proxy por cada usuario: eso
        // inflaba el heap con cientos de miles de proxies.
        iterando = true
        queueMicrotask(() => { iterando = false })
        return Reflect.ownKeys(objetivo)
      },
      get(objetivo, propiedad, receptor) {
        const valor = Reflect.get(objetivo, propiedad, receptor)
        if (!esClaveEntidad(propiedad) || !esObjetoProxiable(valor)) return valor
        // Durante Object.entries/values se usan proxies de nivel 1: marcan
        // mutaciones directas pero no crean proxies anidados para cada campo
        // de cientos de miles de usuarios.
        return almacen.#proxyEntidad(coll, propiedad, valor, { shallow: iterando })
      },
      set(objetivo, propiedad, valor, receptor) {
        if (esClaveEntidad(propiedad)) almacen.marcarEntidad(coll, propiedad)
        return Reflect.set(objetivo, propiedad, valor, receptor)
      },
      deleteProperty(objetivo, propiedad) {
        if (esClaveEntidad(propiedad)) almacen.marcarEntidadBorrada(coll, propiedad)
        return Reflect.deleteProperty(objetivo, propiedad)
      },
    })
  }

  #proxyEntidad(coll, id, raw, { shallow = false } = {}) {
    if (!esObjetoProxiable(raw)) return raw
    if (shallow) {
      // Proxy efímero para lecturas masivas: no se cachea, así no se queda
      // un proxy por cada usuario en memoria después de un /top.
      return this.#crearProxyProfundo(
        () => this.marcarEntidad(coll, id),
        raw,
        new WeakMap(),
        { soloNivel: true }
      )
    }
    let cacheColl = this.proxiesEntidad.get(coll)
    if (!cacheColl) {
      cacheColl = new WeakMap()
      this.proxiesEntidad.set(coll, cacheColl)
    }
    const existente = cacheColl.get(raw)
    if (existente) return existente
    const cache = new WeakMap()
    const proxy = this.#crearProxyProfundo(
      () => this.marcarEntidad(coll, id),
      raw,
      cache,
      { soloNivel: false }
    )
    cache.set(raw, proxy)
    cacheColl.set(raw, proxy)
    return proxy
  }

  /**
   * Proxy profundo (o de nivel 1 si `soloNivel`): envuelve objetos/arrays
   * anidados y marca en la primera mutación. Las lecturas no marcan. `cache`
   * evita proxies duplicados y conserva la identidad.
   */
  #crearProxyProfundo(marcar, raw, cache, { soloNivel = false } = {}) {
    if (!esObjetoProxiable(raw)) return raw
    const existente = cache.get(raw)
    if (existente) return existente
    const proxy = new Proxy(raw, {
      get(objetivo, propiedad, receptor) {
        const valor = Reflect.get(objetivo, propiedad, receptor)
        return !soloNivel && esObjetoProxiable(valor) ? crearNested(valor) : valor
      },
      set(objetivo, propiedad, valor, receptor) {
        marcar()
        return Reflect.set(objetivo, propiedad, valor, receptor)
      },
      deleteProperty(objetivo, propiedad) {
        marcar()
        return Reflect.deleteProperty(objetivo, propiedad)
      },
    })
    const crearNested = (valor) => {
      const guardado = cache.get(valor)
      if (guardado) return guardado
      const nested = this.#crearProxyProfundo(marcar, valor, cache)
      cache.set(valor, nested)
      return nested
    }
    cache.set(raw, proxy)
    return proxy
  }

  /** Objeto real detrás del Proxy (para no marcar nada en el código interno). */
  #enBruto(datos, coll) {
    const actual = datos?.[coll]
    const info = this.rastreados.get(coll)
    if (info && info.proxy === actual) return info.target
    return actual
  }

  #enBrutoSimple(datos, clave) {
    const actual = datos?.[clave]
    const info = this.rastreadosSimples.get(clave)
    if (info && info.proxy === actual) return info.target
    return actual
  }

  marcarEntidad(coll, id) {
    if (!esClaveEntidad(id) || this.fullScanNeeded) return
    let conjunto = this.sucias.get(coll)
    if (!conjunto) {
      conjunto = new Set()
      this.sucias.set(coll, conjunto)
    }
    if (conjunto.has(id)) return
    if (conjunto.size >= this.maxSucias) {
      // Red de seguridad. Con proxies de mutación no debería ocurrir.
      this.fullScanNeeded = true
      conjunto.clear()
      return
    }
    conjunto.add(id)
  }

  marcarEntidadBorrada(coll, id) {
    if (!esClaveEntidad(id)) return
    let conjunto = this.borradas.get(coll)
    if (!conjunto) {
      conjunto = new Set()
      this.borradas.set(coll, conjunto)
    }
    conjunto.add(id)
    this.sucias.get(coll)?.delete(id)
  }

  marcarColeccion(clave) {
    if (!this.fullScanNeeded) this.suciasColecciones.add(clave)
  }

  #programarFlush() {
    if (this.flushPendiente || this.flushEnCurso || this.closePromise) return
    if (!this.datosVivos) return
    const espera = this.intervaloFlushMs
    this.flushPendiente = setTimeout(() => {
      this.flushPendiente = null
      void this.flushSoon()
    }, espera)
    this.flushPendiente.unref?.()
  }

  /** Fuerza un guardado diferido de lo que esté sucio ahora mismo. */
  flushSoon() {
    if (this.flushEnCurso) return this.flushEnCurso
    if (!this.datosVivos) return Promise.resolve()
    if (!this.fullScanNeeded && !this.suciasColecciones.size && !this.#haySucias()) {
      return Promise.resolve()
    }
    this.flushEnCurso = this.write(this.datosVivos).finally(() => {
      this.flushEnCurso = null
    })
    return this.flushEnCurso
  }

  #haySucias() {
    for (const conjunto of this.sucias.values()) if (conjunto.size) return true
    for (const conjunto of this.borradas.values()) if (conjunto.size) return true
    return false
  }

  #tomarSucias() {
    const sucias = new Map()
    for (const [coll, conjunto] of this.sucias) {
      if (conjunto.size) sucias.set(coll, new Set(conjunto))
    }
    const borradas = new Map()
    for (const [coll, conjunto] of this.borradas) {
      if (conjunto.size) borradas.set(coll, new Set(conjunto))
    }
    const colecciones = new Set(this.suciasColecciones)
    const fullScan = this.fullScanNeeded
    this.sucias.clear()
    this.borradas.clear()
    this.suciasColecciones.clear()
    this.fullScanNeeded = false
    return { sucias, borradas, colecciones, fullScan }
  }

  #restaurarSucias(pendientes) {
    for (const [coll, conjunto] of pendientes.sucias) {
      let destino = this.sucias.get(coll)
      if (!destino) {
        destino = new Set()
        this.sucias.set(coll, destino)
      }
      for (const id of conjunto) destino.add(id)
    }
    for (const [coll, conjunto] of pendientes.borradas) {
      let destino = this.borradas.get(coll)
      if (!destino) {
        destino = new Set()
        this.borradas.set(coll, destino)
      }
      for (const id of conjunto) destino.add(id)
    }
    for (const clave of pendientes.colecciones || []) this.suciasColecciones.add(clave)
    if (pendientes.fullScan) this.fullScanNeeded = true
  }

  #debeEscanearTodo() {
    if (!this.intervaloFullScanMs) return false
    if (!this.ultimoFullScan) return true
    return Date.now() - this.ultimoFullScan >= this.intervaloFullScanMs
  }

  // Deriva (parsea) el valor confirmado de una colección o entidad a partir de
  // los strings guardados. Solo se llama para los pocos elementos que cambian.
  #baseDe(clave, id = null) {
    const bolsa = this.baselineStr?.[clave]
    if (id === null) {
      return typeof bolsa === 'string' ? JSON.parse(bolsa) : undefined
    }
    if (!esObjeto(bolsa)) return undefined
    const texto = bolsa[id]
    return texto === undefined ? undefined : JSON.parse(texto)
  }

  async read() {
    await this.#asegurarDb()
    // Snapshot consistente: el cursor de secuencia debe corresponder al mismo
    // instante que las entidades leídas, o se perderían cambios concurrentes.
    const cargado = await this.#conConexion(this.filename, async (db) => {
      await ejecutarLote(db, 'BEGIN')
      try {
        return await this.#cargarTodo(db)
      } finally {
        await ejecutarLote(db, 'COMMIT').catch(() => {})
      }
    })
    this.baselineStr = cargado.baselineStr
    this.revision = cargado.revision
    this.collRev = cargado.collRev
    this.cursorSeq = cargado.cursorSeq
    this.cargado = true
    // Los datos vienen de la DB: están conciliados. No se fuerza un escaneo
    // completo al arrancar (con bases grandes tardaba 20+ s y congelaba todo).
    this.ultimoFullScan = Date.now()
    this.#instalarRastreadores(cargado.datos, { inicial: true })
    return cargado.datos
  }

  write(datosVivos) {
    if (datosVivos == null) return Promise.resolve()
    this.datosVivos = datosVivos
    const operation = this.writeChain.then(() => this.#escribir(datosVivos))
    this.writeChain = operation.catch(() => {})
    return operation
  }

  /**
   * Volcado de cierre: reconcilia todas las entidades aunque el rastreo se
   * haya perdido alguna mutación externa (referencias guardadas por plugins).
   */
  writeCompleto(datosVivos = this.datosVivos) {
    if (datosVivos == null) return Promise.resolve()
    this.fullScanNeeded = true
    return this.write(datosVivos)
  }

  async refresh(datosVivos) {
    if (!esObjeto(datosVivos)) throw new TypeError('No hay datos cargados para sincronizar.')
    this.datosVivos = datosVivos
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
    if (!this.cargado) await this.read()
    const cursor = Number.isFinite(this.cursorSeq) ? this.cursorSeq : 0

    // Un único snapshot de lectura: las revisiones, el delta de entidades y los
    // borrados deben pertenecer al mismo instante para no perder cambios.
    const snapshot = await this.#conConexion(this.filename, async (db) => {
      await ejecutarLote(db, 'BEGIN')
      try {
        const revs = await consultarTodos(db, `SELECT key, revision FROM ${TABLA_COLECCIONES}`)
        const revsColl = await consultarTodos(db, `SELECT collection, revision FROM ${TABLA_REVS}`)
        const revisionRemota = new Map(revs.map((fila) => [fila.key, Number(fila.revision)]))
        const collRemota = new Map(revsColl.map((fila) => [fila.collection, Number(fila.revision)]))
        // Solo lo que cambió desde el último refresh de este proceso.
        const ents = await consultarTodos(
          db,
          `SELECT collection, id, data, revision, updated FROM ${TABLA_ENTIDADES} WHERE updated > ?`,
          [cursor]
        )
        const borradas = await consultarTodos(
          db,
          `SELECT collection, id, borrado_en FROM ${TABLA_ENTIDADES_BORRADAS} WHERE borrado_en > ?`,
          [cursor]
        )
        return { revisionRemota, collRemota, ents, borradas }
      } finally {
        await ejecutarLote(db, 'COMMIT').catch(() => {})
      }
    })

    const { revisionRemota, collRemota, ents, borradas } = snapshot
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
      await this.#conConexion(this.filename, async (db) => {
        for (const lote of porLotes(cambiadas)) {
          const placeholders = lote.map(() => '?').join(',')
          const filas = await consultarTodos(
            db,
            `SELECT key, payload, revision FROM ${TABLA_COLECCIONES} WHERE key IN (${placeholders})`,
            lote
          )
          for (const fila of filas) confirmadas.set(fila.key, fila)
        }
      })
      for (const clave of cambiadas) {
        const fila = confirmadas.get(clave)
        const base = this.#baseDe(clave)
        const local = Object.prototype.hasOwnProperty.call(datosVivos, clave)
          ? normalizarColeccion(datosVivos[clave])
          : undefined
        if (!fila) {
          if (local === undefined || mismoValor(base, local)) {
            delete datosVivos[clave]
            delete this.baselineStr[clave]
            delete this.revision[clave]
          }
          continue
        }
        const actual = JSON.parse(fila.payload)
        const combinado = combinarCambios(base, local, actual, clave, '', resolver)
        if (combinado === undefined) delete datosVivos[clave]
        else datosVivos[clave] = combinado
        this.baselineStr[clave] = fila.payload
        this.revision[clave] = Number(fila.revision)
      }
    }

    // 2) Colecciones fragmentadas: solo el delta (cambios y borrados) desde el
    // cursor. Antes se leían TODAS las entidades en cada sincronización.
    const entPorColl = new Map()
    for (const fila of ents) {
      if (!FRAGMENTADAS.has(fila.collection)) continue
      let mapa = entPorColl.get(fila.collection)
      if (!mapa) {
        mapa = new Map()
        entPorColl.set(fila.collection, mapa)
      }
      mapa.set(fila.id, { data: fila.data, revision: Number(fila.revision) })
    }
    const borradasPorColl = new Map()
    for (const fila of borradas) {
      if (!FRAGMENTADAS.has(fila.collection)) continue
      let mapa = borradasPorColl.get(fila.collection)
      if (!mapa) {
        mapa = new Map()
        borradasPorColl.set(fila.collection, mapa)
      }
      mapa.set(fila.id, Number(fila.borrado_en))
    }

    for (const coll of FRAGMENTADAS) {
      const remota = collRemota.get(coll)
      const cambios = entPorColl.get(coll)
      const eliminadas = borradasPorColl.get(coll)
      const baseStrColl = esObjeto(this.baselineStr[coll]) ? this.baselineStr[coll] : {}
      let vivo = this.#enBruto(datosVivos, coll)

      // Borrados remotos: se descartan del estado vivo salvo que haya una
      // edición local sin confirmar (mismo criterio que antes).
      if (eliminadas) {
        for (const id of eliminadas.keys()) {
          const local = Object.prototype.hasOwnProperty.call(vivo || {}, id)
            ? vivo[id]
            : undefined
          const base = baseStrColl[id] !== undefined ? JSON.parse(baseStrColl[id]) : undefined
          if (local === undefined || mismoValor(base, local)) {
            delete vivo?.[id]
            delete this.baselineStr[coll]?.[id]
            delete this.revision[coll]?.[id]
          }
        }
      }

      if (cambios) {
        for (const [id, info] of cambios) {
          const base = baseStrColl[id] !== undefined ? JSON.parse(baseStrColl[id]) : undefined
          const local = Object.prototype.hasOwnProperty.call(vivo || {}, id)
            ? normalizarColeccion(vivo[id])
            : undefined
          const actual = JSON.parse(info.data)
          const combinado = combinarCambios(base, local, actual, id, '', resolver)
          if (!esObjeto(vivo)) {
            vivo = {}
            datosVivos[coll] = vivo
          }
          if (combinado === undefined) delete vivo[id]
          else vivo[id] = combinado
          if (!esObjeto(this.baselineStr[coll])) {
            this.baselineStr[coll] = {}
            this.revision[coll] = {}
          }
          this.baselineStr[coll][id] = info.data
          this.revision[coll][id] = info.revision
        }
      }

      if (remota !== undefined) {
        // La colección existe en disco pero está vacía (o quedó vacía): se
        // adopta como {} si este proceso aún no la conoce.
        if (!esObjeto(vivo) && !esObjeto(this.baselineStr[coll])) {
          vivo = {}
          datosVivos[coll] = vivo
          this.baselineStr[coll] = {}
          this.revision[coll] = {}
        }
        this.collRev[coll] = remota
      }
    }
    this.#instalarRastreadores(datosVivos, { inicial: true })

    // Avanza el cursor hasta la mayor secuencia leída en el snapshot.
    let nuevaSecuencia = cursor
    for (const fila of ents) nuevaSecuencia = Math.max(nuevaSecuencia, Number(fila.updated) || 0)
    for (const fila of borradas) nuevaSecuencia = Math.max(nuevaSecuencia, Number(fila.borrado_en) || 0)
    this.cursorSeq = nuevaSecuencia

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
    this.datosVivos = datosVivos
    this.#instalarRastreadores(datosVivos, { inicial: true })
    await this.#asegurarDb()
    const resultado = await this.#transaccion(this.filename, async (db) => {
      if (!this.cargado) {
        // Camino frío (no se llamó a read() todavía): se carga el estado
        // completo y se hidrata el objeto vivo una sola vez.
        const cargado = await this.read()
        for (const clave of Object.keys(cargado)) {
          if (clave === CLAVE_SOLO_MEMORIA) continue
          datosVivos[clave] = cargado[clave]
        }
      }
      // Solo revisiones de las colecciones simples (sin payloads): lo que no
      // se movió no se carga.
      const revs = await consultarTodos(db, `SELECT key, revision FROM ${TABLA_COLECCIONES}`)
      const revsColl = await consultarTodos(db, `SELECT collection, revision FROM ${TABLA_REVS}`)
      const revSimple = new Map(revs.map((fila) => [fila.key, Number(fila.revision)]))
      const revFrag = new Map(revsColl.map((fila) => [fila.collection, Number(fila.revision)]))

      // Delta de entidades/borrados desde el último refresh: se lee solo lo que
      // cambió remotamente en vez de TODAS las entidades. El cursor NO se avanza
      // aquí (el refresh sigue reconciliando el resto del estado vivo).
      const cursor = Number.isFinite(this.cursorSeq) ? this.cursorSeq : 0
      const remotoEnt = new Map()
      const remotoBorrado = new Map()
      {
        const ents = await consultarTodos(
          db,
          `SELECT collection, id, data, revision FROM ${TABLA_ENTIDADES} WHERE updated > ?`,
          [cursor]
        )
        for (const fila of ents) {
          if (!FRAGMENTADAS.has(fila.collection)) continue
          let mapa = remotoEnt.get(fila.collection)
          if (!mapa) {
            mapa = new Map()
            remotoEnt.set(fila.collection, mapa)
          }
          mapa.set(fila.id, { data: fila.data, revision: Number(fila.revision) })
        }
        const borradas = await consultarTodos(
          db,
          `SELECT collection, id, borrado_en FROM ${TABLA_ENTIDADES_BORRADAS} WHERE borrado_en > ?`,
          [cursor]
        )
        for (const fila of borradas) {
          if (!FRAGMENTADAS.has(fila.collection)) continue
          let mapa = remotoBorrado.get(fila.collection)
          if (!mapa) {
            mapa = new Map()
            remotoBorrado.set(fila.collection, mapa)
          }
          mapa.set(fila.id, Number(fila.borrado_en))
        }
      }

      const datos = {}
      let secuencia = null
      const siguienteSecuencia = async () => {
        if (secuencia === null) secuencia = await this.#nuevaSecuencia(db)
        return secuencia
      }

      const vistosSimples = new Map()
      const clavesSimples = new Set([
        ...Object.keys(datosVivos),
        ...revSimple.keys(),
        ...Object.keys(this.baselineStr),
      ])
      for (const clave of clavesSimples) {
        if (clave === CLAVE_SOLO_MEMORIA || FRAGMENTADAS.has(clave)) continue
        const revD = revSimple.get(clave)
        const revB = this.revision[clave]
        const baseStr = this.baselineStr[clave]
        const base = typeof baseStr === 'string' ? JSON.parse(baseStr) : undefined
        const local = Object.prototype.hasOwnProperty.call(datosVivos, clave)
          ? normalizarColeccion(datosVivos[clave])
          : undefined
        if (revD !== undefined && revD === revB && typeof revB === 'number') {
          const valor = combinarCambios(base, local, base === undefined ? undefined : clonar(base), clave, '')
          vistosSimples.set(clave, { str: baseStr, rev: revB, existe: baseStr !== undefined })
          if (valor !== undefined) datos[clave] = valor
          continue
        }
        const fila = await consultar(
          db, `SELECT payload, revision FROM ${TABLA_COLECCIONES} WHERE key = ?`, [clave]
        )
        const actual = fila ? JSON.parse(fila.payload) : undefined
        const valor = combinarCambios(base, local, actual, clave, '')
        vistosSimples.set(clave, {
          str: fila?.payload,
          rev: Number(fila?.revision ?? 0),
          existe: Boolean(fila),
        })
        if (valor !== undefined) datos[clave] = valor
      }

      // Colecciones fragmentadas: mapa perezoso. Solo se materializa (y se
      // persiste) lo que el callback realmente toca, en vez de clonar y
      // combinar decenas de miles de entidades dentro del lock de escritura.
      const controles = new Map()
      for (const coll of FRAGMENTADAS) {
        const control = this.#mapaPerezoso(datosVivos, coll, remotoEnt.get(coll), remotoBorrado.get(coll))
        controles.set(coll, control)
        datos[coll] = control.proxy
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
        const visto = vistosSimples.get(clave)
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
      for (const [clave, visto] of vistosSimples) {
        if (Object.prototype.hasOwnProperty.call(datos, clave)) continue
        if (visto.existe) {
          await ejecutar(db, `DELETE FROM ${TABLA_COLECCIONES} WHERE key = ?`, [clave])
        }
      }
      // Persistencia de las entidades tocadas por el callback.
      const fragmentadas = []
      for (const coll of FRAGMENTADAS) {
        const control = controles.get(coll)
        const cambios = new Map()
        const escritos = []
        let toco = false
        for (const id of control.tocados) {
          const tiene = Object.prototype.hasOwnProperty.call(control.target, id)
          const valor = tiene ? control.target[id] : undefined
          const discoStr = control.discoStr(id)
          if (tiene) {
            const texto = JSON.stringify(valor)
            if (discoStr !== undefined && discoStr === texto) {
              cambios.set(id, { valor, revision: control.discoRev(id) })
              continue
            }
            await this.#guardarEntidad(db, coll, id, valor, await siguienteSecuencia())
            cambios.set(id, { valor, revision: 0 })
            toco = true
            escritos.push(id)
          } else {
            cambios.set(id, { valor: undefined, revision: 0 })
            if (discoStr !== undefined) {
              await this.#marcarEntidadBorrada(db, coll, id, await siguienteSecuencia())
              toco = true
            }
          }
        }
        if (toco) {
          await this.#bumpCollRev(db, coll)
          const fila = await consultar(db, `SELECT revision FROM ${TABLA_REVS} WHERE collection = ?`, [coll])
          collRevs[coll] = Number(fila?.revision ?? 0)
        } else {
          collRevs[coll] = revFrag.get(coll) ?? this.collRev[coll] ?? 0
        }
        for (const lote of porLotes(escritos)) {
          if (!lote.length) continue
          const placeholders = lote.map(() => '?').join(',')
          const filas = await consultarTodos(
            db,
            `SELECT id, revision FROM ${TABLA_ENTIDADES} WHERE collection = ? AND id IN (${placeholders})`,
            [coll, ...lote]
          )
          for (const fila of filas) {
            const cambio = cambios.get(fila.id)
            if (cambio) cambio.revision = Number(fila.revision)
          }
        }
        fragmentadas.push({ coll, cambios })
      }
      return { acquired: true, result, datos, revisiones, fragmentadas, collRevs }
    })
    if (!resultado.datos) return resultado

    // Conciliación en memoria, ya confirmada la transacción. Solo se tocan las
    // colecciones y entidades que realmente cambiaron.
    for (const clave of Object.keys(resultado.datos)) {
      if (clave === CLAVE_SOLO_MEMORIA || FRAGMENTADAS.has(clave)) continue
      const nuevo = resultado.datos[clave]
      if (esObjeto(nuevo) && esObjeto(datosVivos[clave])) {
        actualizarObjetoVivo(datosVivos[clave], nuevo)
      } else {
        datosVivos[clave] = nuevo
      }
      this.baselineStr[clave] = JSON.stringify(nuevo)
      this.revision[clave] = resultado.revisiones[clave] ?? this.revision[clave] ?? 0
    }
    for (const clave of Object.keys(this.baselineStr)) {
      if (clave === CLAVE_SOLO_MEMORIA || FRAGMENTADAS.has(clave)) continue
      if (Object.prototype.hasOwnProperty.call(resultado.datos, clave)) continue
      delete datosVivos[clave]
      delete this.baselineStr[clave]
      delete this.revision[clave]
    }
    for (const { coll, cambios } of resultado.fragmentadas) {
      let vivo = this.#enBruto(datosVivos, coll)
      if (!esObjeto(vivo)) {
        vivo = {}
        datosVivos[coll] = vivo
      }
      if (!esObjeto(this.baselineStr[coll])) this.baselineStr[coll] = {}
      if (!esObjeto(this.revision[coll])) this.revision[coll] = {}
      for (const [id, cambio] of cambios) {
        if (cambio.valor === undefined) {
          delete vivo[id]
          delete this.baselineStr[coll][id]
          delete this.revision[coll][id]
        } else {
          const actual = vivo[id]
          if (esObjeto(cambio.valor) && esObjeto(actual)) {
            actualizarObjetoVivo(actual, cambio.valor)
          } else {
            vivo[id] = cambio.valor
          }
          if (!this.singleWriter) {
            this.baselineStr[coll][id] = JSON.stringify(cambio.valor)
          }
          this.revision[coll][id] = cambio.revision
        }
      }
      if (resultado.collRevs?.[coll] !== undefined) this.collRev[coll] = resultado.collRevs[coll]
    }
    this.#instalarRastreadores(datosVivos, { inicial: true })
    return { acquired: resultado.acquired, result: resultado.result }
  }

  // Mapa perezoso de una colección fragmentada. Evita clonar/combinar TODAS las
  // entidades dentro del lock de escritura: cada id se materializa (merge
  // confirmado + local + delta remoto) la primera vez que el callback lo lee o
  // escribe, y las mutaciones quedan aisladas hasta confirmar la transacción.
  #mapaPerezoso(datosVivos, coll, remoto, borrado) {
    const vivos = esObjeto(this.#enBruto(datosVivos, coll))
      ? this.#enBruto(datosVivos, coll)
      : {}
    const baseStr = esObjeto(this.baselineStr[coll]) ? this.baselineStr[coll] : {}
    const revBase = esObjeto(this.revision[coll]) ? this.revision[coll] : {}
    const target = {}
    const tocados = new Set()
    const eliminados = new Set()

    const discoStr = (id) => {
      const fila = remoto?.get(id)
      if (fila) return fila.data
      if (borrado && borrado.has(id)) return undefined
      return Object.prototype.hasOwnProperty.call(baseStr, id) ? baseStr[id] : undefined
    }
    const discoRev = (id) => {
      const fila = remoto?.get(id)
      if (fila) return fila.revision
      if (borrado && borrado.has(id)) return 0
      return revBase[id] ?? 0
    }
    const materializar = (id) => {
      if (Object.prototype.hasOwnProperty.call(target, id)) return target[id]
      if (!eliminados.has(id)) tocados.add(id)
      const textoBase = Object.prototype.hasOwnProperty.call(baseStr, id) ? baseStr[id] : undefined
      const base = textoBase !== undefined ? JSON.parse(textoBase) : undefined
      const local = Object.prototype.hasOwnProperty.call(vivos, id)
        ? normalizarColeccion(vivos[id])
        : undefined
      const fila = remoto?.get(id)
      let valor
      if (fila) {
        valor = combinarCambios(base, local, JSON.parse(fila.data), id, '')
      } else if (borrado && borrado.has(id)) {
        valor = combinarCambios(base, local, undefined, id, '')
      } else {
        valor = combinarCambios(base, local, base === undefined ? undefined : clonar(base), id, '')
      }
      if (valor !== undefined) target[id] = valor
      else eliminados.add(id)
      return valor
    }
    const proxy = new Proxy(target, {
      get(destino, prop, receptor) {
        if (typeof prop === 'symbol') return Reflect.get(destino, prop, receptor)
        if (Object.prototype.hasOwnProperty.call(destino, prop)) return destino[prop]
        if (eliminados.has(prop)) return undefined
        if (prop in Object.prototype) return Reflect.get(destino, prop, receptor)
        return materializar(prop)
      },
      set(destino, prop, valor) {
        if (typeof prop === 'symbol') {
          destino[prop] = valor
          return true
        }
        tocados.add(prop)
        eliminados.delete(prop)
        destino[prop] = valor
        return true
      },
      deleteProperty(destino, prop) {
        if (typeof prop === 'symbol') return Reflect.deleteProperty(destino, prop)
        tocados.add(prop)
        eliminados.add(prop)
        delete destino[prop]
        return true
      },
      has(destino, prop) {
        if (typeof prop === 'symbol') return Reflect.has(destino, prop)
        if (Object.prototype.hasOwnProperty.call(destino, prop)) return true
        if (eliminados.has(prop)) return false
        return discoStr(prop) !== undefined
      },
      ownKeys(destino) {
        const claves = new Set([
          ...Object.keys(baseStr),
          ...Object.keys(vivos),
          ...Object.keys(destino),
        ])
        for (const id of eliminados) claves.delete(id)
        return [...claves]
      },
      getOwnPropertyDescriptor(destino, prop) {
        if (typeof prop === 'symbol') return Reflect.getOwnPropertyDescriptor(destino, prop)
        if (Object.prototype.hasOwnProperty.call(destino, prop)) {
          return { value: destino[prop], writable: true, enumerable: true, configurable: true }
        }
        if (eliminados.has(prop) || prop in Object.prototype) return undefined
        const valor = materializar(prop)
        if (valor === undefined) return undefined
        return { value: valor, writable: true, enumerable: true, configurable: true }
      },
    })
    return { proxy, tocados, target, discoStr, discoRev }
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
    if (this.flushPendiente) {
      clearTimeout(this.flushPendiente)
      this.flushPendiente = null
    }
    this.closePromise = this.#cerrarConexiones()
    return this.closePromise
  }

  async #cerrarConexiones() {
    // Nada de escrituras diferidas después de cerrar las conexiones.
    this.datosVivos = null
    if (this.flushPendiente) {
      clearTimeout(this.flushPendiente)
      this.flushPendiente = null
    }
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
            updated INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (collection, id)
          )
        `)
        // Migración de bases previas: añade la columna de secuencia si falta.
        const columnasEntidades = await consultarTodos(db, `PRAGMA table_info(${TABLA_ENTIDADES})`)
        if (!columnasEntidades.some((columna) => columna.name === 'updated')) {
          await ejecutarLote(
            db,
            `ALTER TABLE ${TABLA_ENTIDADES} ADD COLUMN updated INTEGER NOT NULL DEFAULT 0`
          )
        }
        await ejecutarLote(
          db,
          `CREATE INDEX IF NOT EXISTS idx_${TABLA_ENTIDADES}_updated ON ${TABLA_ENTIDADES} (updated)`
        )
        await ejecutarLote(db, `
          CREATE TABLE IF NOT EXISTS ${TABLA_REVS} (
            collection TEXT PRIMARY KEY,
            revision INTEGER NOT NULL DEFAULT 0
          )
        `)
        // Borrados por secuencia: permiten al refresh detectar eliminaciones sin
        // recorrer todas las entidades.
        await ejecutarLote(db, `
          CREATE TABLE IF NOT EXISTS ${TABLA_ENTIDADES_BORRADAS} (
            collection TEXT NOT NULL,
            id TEXT NOT NULL,
            borrado_en INTEGER NOT NULL,
            PRIMARY KEY (collection, id)
          )
        `)
        await ejecutarLote(
          db,
          `CREATE INDEX IF NOT EXISTS idx_${TABLA_ENTIDADES_BORRADAS}_seq ON ${TABLA_ENTIDADES_BORRADAS} (borrado_en)`
        )
        await ejecutarLote(db, `
          CREATE TABLE IF NOT EXISTS ${TABLA_CURSOR} (
            nombre TEXT PRIMARY KEY,
            valor INTEGER NOT NULL DEFAULT 0
          )
        `)
        await ejecutar(
          db,
          `INSERT OR IGNORE INTO ${TABLA_CURSOR} (nombre, valor) VALUES (?, 0)`,
          [CLAVE_CURSOR_ENTIDADES]
        )
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

  // Carga todo el estado dentro de una transacción en curso. La vista
  // confirmada se guarda solo como strings (baselineStr) + revisiones; no se
  // conserva una copia parseada para no duplicar la RAM de users/chats.
  async #cargarTodo(db) {
    const filas = await consultarTodos(db, `SELECT key, payload, revision FROM ${TABLA_COLECCIONES}`)
    const entidades = await consultarTodos(db, `SELECT collection, id, data, revision FROM ${TABLA_ENTIDADES}`)
    const revs = await consultarTodos(db, `SELECT collection, revision FROM ${TABLA_REVS}`)
    const datos = {}
    const baselineStr = {}
    const revision = {}
    for (const fila of filas) {
      if (fila.key === CLAVE_SOLO_MEMORIA || FRAGMENTADAS.has(fila.key)) continue
      datos[fila.key] = JSON.parse(fila.payload)
      baselineStr[fila.key] = fila.payload
      revision[fila.key] = Number(fila.revision)
    }
    for (const fila of entidades) {
      if (!FRAGMENTADAS.has(fila.collection)) continue
      if (!esObjeto(datos[fila.collection])) {
        datos[fila.collection] = {}
        baselineStr[fila.collection] = {}
        revision[fila.collection] = {}
      }
      datos[fila.collection][fila.id] = JSON.parse(fila.data)
      // Escritor único: no duplicamos el JSON de cada usuario/chat en RAM.
      // El valor confirmado se lee de la fila cuando hace falta fusionar.
      if (!this.singleWriter) baselineStr[fila.collection][fila.id] = fila.data
      revision[fila.collection][fila.id] = Number(fila.revision)
    }
    const collRev = {}
    for (const fila of revs) collRev[fila.collection] = Number(fila.revision)
    for (const coll of FRAGMENTADAS) {
      if (Object.prototype.hasOwnProperty.call(collRev, coll) && !esObjeto(datos[coll])) {
        datos[coll] = {}
        baselineStr[coll] = {}
        revision[coll] = {}
      }
    }
    return { datos, baselineStr, revision, collRev, cursorSeq: await this.#secuenciaMaxima(db) }
  }

  // Mayor secuencia de entidad/borrado visible en esta conexión.
  async #secuenciaMaxima(db) {
    const entidades = await consultar(db, `SELECT MAX(updated) AS maximo FROM ${TABLA_ENTIDADES}`)
    const borradas = await consultar(db, `SELECT MAX(borrado_en) AS maximo FROM ${TABLA_ENTIDADES_BORRADAS}`)
    return Math.max(
      Number(entidades?.maximo ?? 0),
      Number(borradas?.maximo ?? 0),
      0
    )
  }

  async #escribir(datosVivos) {
    const primeraCarga = !this.cargado
    if (primeraCarga) await this.read()
    this.datosVivos = datosVivos
    // Si el objeto vivo ha cambiado de forma externa (p. ej. se reemplazó
    // users/chats), instalar los proxies marca lo necesario antes de detectar.
    this.#instalarRastreadores(datosVivos, { inicial: primeraCarga })
    const inicioEscribir = Date.now()
    const pendientes = this.#tomarSucias()
    const escaneoTodo = pendientes.fullScan || primeraCarga || this.#debeEscanearTodo()
    const sucias = await this.#detectarSucias(datosVivos, pendientes, escaneoTodo)
    const suciasEnt = await this.#detectarSuciasEnt(datosVivos, pendientes, escaneoTodo)
    if (escaneoTodo) {
      this.ultimoFullScan = Date.now()
      this.estadisticas.fullScans++
    }
    const msDeteccion = Date.now() - inicioEscribir
    if (msDeteccion > 1000) console.warn(`[db] detección de cambios: ${msDeteccion} ms`)
    const claves = Object.keys(sucias)
    const collsSucias = Object.keys(suciasEnt).filter((coll) => suciasEnt[coll].size > 0)
    const totalEntidades = collsSucias.reduce((total, coll) => total + suciasEnt[coll].size, 0)
    if (totalEntidades > 500) {
      const detalle = collsSucias.map((coll) => `${coll}=${suciasEnt[coll].size}`).join(', ')
      console.warn(`[db] flush grande: ${totalEntidades} entidad(es) (${detalle})`)
    }
    if (!claves.length && !collsSucias.length) {
      return
    }
    const escritas = {}
    const escritasEnt = {}
    const revisiones = {}
    const collRevs = {}
    try {
      await this.#asegurarDb()
      await this.#transaccion(this.filename, async (db) => {
      let secuencia = null
      const siguienteSecuencia = async () => {
        if (secuencia === null) secuencia = await this.#nuevaSecuencia(db)
        return secuencia
      }
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
              combinado = combinarCambios(this.#baseDe(clave), sucias[clave], actual, clave, '')
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
          // Escritor único: no hay baseline duplicado; se fusiona contra la
          // fila confirmada de SQLite.
          const base = this.singleWriter ? actual : this.#baseDe(coll, id)
          const local = pedida.existe ? pedida.valor : undefined
          let combinado
          let combinadoDirecto = false
          if (!this.singleWriter && fila && fila.data === this.baselineStr[coll]?.[id]) {
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
          let escrito = false
          if (combinado === undefined) {
            if (fila) {
              await this.#marcarEntidadBorrada(db, coll, id, await siguienteSecuencia())
              toco = true
            }
            delete escritasEnt[coll][id]
          } else {
            const texto = JSON.stringify(combinado)
            if (!fila || fila.data !== texto) {
              await this.#guardarEntidad(db, coll, id, combinado, await siguienteSecuencia())
              toco = true
              escrito = true
            }
            escritasEnt[coll][id] = combinado
          }
          if (!esObjeto(this.revision[coll])) this.revision[coll] = {}
          let filaNueva = fila
          if (escrito) {
            if (this.singleWriter) {
              // Escritor único: la revisión es la anterior + 1. Evita una
              // consulta por cada entidad escrita.
              filaNueva = { revision: (fila ? Number(fila.revision) : 0) + 1 }
            } else {
              filaNueva = await consultar(
                db,
                `SELECT revision FROM ${TABLA_ENTIDADES} WHERE collection = ? AND id = ?`,
                [coll, id]
              )
            }
          }
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
    } catch (error) {
      this.#restaurarSucias(pendientes)
      throw error
    }

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
      this.baselineStr[clave] = JSON.stringify(escritas[clave])
      this.revision[clave] = revisiones[clave] ?? this.revision[clave] ?? 0
    }
    for (const coll of collsSucias) {
      let vivo = this.#enBruto(datosVivos, coll)
      if (!esObjeto(vivo)) {
        vivo = {}
        datosVivos[coll] = vivo
      }
      if (!esObjeto(this.baselineStr[coll])) {
        this.baselineStr[coll] = {}
        this.revision[coll] = {}
      }
      for (const id of Object.keys(escritasEnt[coll])) {
        let fusionado
        try {
          fusionado = combinarCambios(
            suciasEnt[coll].get(id)?.existe ? suciasEnt[coll].get(id).valor : undefined,
            normalizarColeccion(vivo[id]),
            escritasEnt[coll][id],
            id,
            ''
          )
        } catch (error) {
          if (error?.code !== 'ERR_SQLITE_WRITE_CONFLICT') throw error
          fusionado = normalizarColeccion(vivo[id])
        }
        if (fusionado === undefined) {
          delete vivo[id]
          delete this.baselineStr[coll][id]
          delete this.revision[coll][id]
        } else {
          vivo[id] = fusionado
          if (!this.singleWriter) {
            this.baselineStr[coll][id] = JSON.stringify(escritasEnt[coll][id])
          }
        }
      }
      // Entidades eliminadas localmente.
      for (const [id, pedida] of suciasEnt[coll]) {
        if (pedida.existe || escritasEnt[coll][id] !== undefined) continue
        delete vivo[id]
        delete this.baselineStr[coll]?.[id]
        delete this.revision[coll]?.[id]
      }
      if (collRevs[coll] !== undefined) this.collRev[coll] = collRevs[coll]
    }
    this.#instalarRastreadores(datosVivos, { inicial: true })
    const msTotal = Date.now() - inicioEscribir
    this.estadisticas.flushes++
    this.estadisticas.entidades += collsSucias.reduce((total, coll) => total + suciasEnt[coll].size, 0)
    this.estadisticas.ultimoMs = msTotal
    this.estadisticas.maxMs = Math.max(this.estadisticas.maxMs, msTotal)
    if (msTotal > 2000) console.warn(`[db] escritura total: ${msTotal} ms`)
  }

  async #detectarSucias(datosVivos, pendientes = null, escaneoTodo = false) {
    const sucias = {}
    const claves = escaneoTodo
      ? Object.keys(datosVivos)
      : [...(pendientes?.colecciones || [])]
    for (const clave of claves) {
      if (clave === CLAVE_SOLO_MEMORIA || FRAGMENTADAS.has(clave)) continue
      const inicio = Date.now()
      const normalizada = normalizarColeccion(this.#enBrutoSimple(datosVivos, clave))
      const texto = JSON.stringify(normalizada)
      if (!(clave in this.baselineStr) || this.baselineStr[clave] !== texto) {
        sucias[clave] = normalizada
      }
      const demora = Date.now() - inicio
      if (demora > 300) {
        console.warn(`[db] detectar ${clave}: ${demora} ms`)
      }
    }
    return sucias
  }

  // Mapa colección -> Map(id -> { existe, valor }) con lo que cambió.
  // Con rastreo solo se serializan las entidades tocadas; el escaneo completo
  // queda como red de seguridad (15 min o cuando se enumeró toda la colección).
  async #detectarSuciasEnt(datosVivos, pendientes = null, escaneoTodo = false) {
    const sucias = {}
    for (const coll of FRAGMENTADAS) {
      const inicioColl = Date.now()
      const mapa = new Map()
      const live = this.#enBruto(datosVivos, coll)
      const vivo = esObjeto(live) ? live : {}
      const baseStr = esObjeto(this.baselineStr[coll]) ? this.baselineStr[coll] : {}
      let procesadas = 0

      let ids
      if (escaneoTodo || !pendientes) {
        const conjunto = new Set(Object.keys(vivo))
        for (const id of Object.keys(baseStr)) conjunto.add(id)
        ids = conjunto
      } else {
        const conjunto = new Set()
        for (const id of pendientes.sucias.get(coll) || []) conjunto.add(id)
        for (const id of pendientes.borradas.get(coll) || []) conjunto.add(id)
        ids = conjunto
      }

      for (const id of ids) {
        const tiene = Object.prototype.hasOwnProperty.call(vivo, id)
        const normalizado = tiene ? normalizarColeccion(vivo[id]) : undefined
        if (!tiene) {
          if (Object.prototype.hasOwnProperty.call(baseStr, id)) {
            mapa.set(id, { existe: false, valor: undefined })
          }
        } else if (!(id in baseStr) || baseStr[id] !== JSON.stringify(normalizado)) {
          mapa.set(id, { existe: true, valor: normalizado })
        }
        if (++procesadas % LOTE_DETECCION === 0) await cederEventLoop()
      }
      sucias[coll] = mapa
      const demoraColl = Date.now() - inicioColl
      if (demoraColl > 500) {
        console.warn(`[db] detectar entidades ${coll}: ${demoraColl} ms (${mapa.size} cambios)`)
      }
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

  async #guardarEntidad(db, coll, id, valor, secuencia = 0) {
    await ejecutar(
      db,
      `INSERT INTO ${TABLA_ENTIDADES} (collection, id, data, revision, updated) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, revision = ${TABLA_ENTIDADES}.revision + 1, updated = excluded.updated`,
      [coll, id, JSON.stringify(valor), secuencia]
    )
    // Una entidad viva deja de tener borrado pendiente.
    await ejecutar(
      db,
      `DELETE FROM ${TABLA_ENTIDADES_BORRADAS} WHERE collection = ? AND id = ?`,
      [coll, id]
    )
  }

  async #marcarEntidadBorrada(db, coll, id, secuencia) {
    await ejecutar(db, `DELETE FROM ${TABLA_ENTIDADES} WHERE collection = ? AND id = ?`, [coll, id])
    await ejecutar(
      db,
      `INSERT INTO ${TABLA_ENTIDADES_BORRADAS} (collection, id, borrado_en) VALUES (?, ?, ?)
       ON CONFLICT(collection, id) DO UPDATE SET borrado_en = excluded.borrado_en`,
      [coll, id, secuencia]
    )
  }

  // Secuencia monotónica compartida por todas las entidades y borrados. Se
  // incrementa una vez por transacción de escritura; así el refresh puede
  // pedir solo lo posterior a su cursor en lugar de recorrer todo.
  async #nuevaSecuencia(db) {
    await ejecutar(
      db,
      `INSERT OR IGNORE INTO ${TABLA_CURSOR} (nombre, valor) VALUES (?, 0)`,
      [CLAVE_CURSOR_ENTIDADES]
    )
    await ejecutar(
      db,
      `UPDATE ${TABLA_CURSOR} SET valor = valor + 1 WHERE nombre = ?`,
      [CLAVE_CURSOR_ENTIDADES]
    )
    const fila = await consultar(db, `SELECT valor FROM ${TABLA_CURSOR} WHERE nombre = ?`, [CLAVE_CURSOR_ENTIDADES])
    return Number(fila?.valor ?? 0)
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
