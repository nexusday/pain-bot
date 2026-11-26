/**
 * Almacén de autenticación por sesión, en memoria y con diario en disco.
 *
 * `useMultiFileAuthState` guarda cada clave Signal en un fichero distinto y la
 * escribe en cada mensaje. Con 300 sub-bots eso son miles de ficheros pequeños,
 * mucha CPU de serialización y una reconexión lenta. Baileys recomienda no
 * usarlo en producción.
 *
 * Este almacén mantiene credenciales y claves en RAM:
 *   - `creds.json`            → compatibilidad con el panel/recovery (250 ms).
 *   - `auth-keys.json`        → snapshot compacto de las claves (60 s).
 *   - `auth-keys.ndjson`      → diario append-only con los cambios (100 ms).
 *
 * En el arranque se carga el snapshot y se reproduce el diario. Las claves
 * viejas en ficheros sueltos se leen una sola vez (migración perezosa).
 */
import fs from 'node:fs'
import path from 'node:path'
import { BufferJSON, proto } from '@whiskeysockets/baileys'

const MAPA_CLAVES = {
  'pre-key': 'preKeys',
  'session': 'sessions',
  'sender-key': 'senderKeys',
  'app-state-sync-key': 'appStateSyncKeys',
  'app-state-sync-version': 'appStateVersions',
  'sender-key-memory': 'senderKeyMemory'
}

const ARCHIVO_CLAVES = 'auth-keys.json'
const ARCHIVO_DIARIO = 'auth-keys.ndjson'
const REGEX_CLAVE_LEGACY = /^(pre-key|session|sender-key|sender-key-memory|app-state-sync-key|app-state-sync-version)-.+\.json$/i

const INTERVALO_CREDS_MS = Math.min(
  Math.max(Number.parseInt(process.env.PAIN_AUTH_CREDS_MS, 10) || 250, 50),
  5_000
)
const INTERVALO_DIARIO_MS = Math.min(
  Math.max(Number.parseInt(process.env.PAIN_AUTH_JOURNAL_MS, 10) || 500, 20),
  2_000
)
const INTERVALO_COMPACTO_MS = Math.min(
  Math.max(Number.parseInt(process.env.PAIN_AUTH_COMPACT_MS, 10) || 30 * 60_000, 5_000),
  30 * 60_000
)
const COMPACTAR_TRAS_CAMBIOS = 5_000
const COMPACTAR_SI_DIARIO_BYTES = 2 * 1024 * 1024
// Por defecto solo se borran los ficheros legacy cuyas claves YA están en
// memoria. Así nunca se pierde una sesión que aún no se había leído.
const LIMPIAR_LEGACY = process.env.PAIN_AUTH_COMPACT !== '0'

const almacenes = new Map()
const creandoAlmacen = new Map()

function claveFichero(clave = '') {
  return String(clave).replace(/\//g, '__').replace(/:/g, '-')
}

function clavesVacias() {
  return {
    preKeys: {},
    sessions: {},
    senderKeys: {},
    appStateSyncKeys: {},
    appStateVersions: {},
    senderKeyMemory: {}
  }
}

function escribirAtomico(destino, contenido) {
  const temporal = `${destino}.${process.pid}.tmp`
  return fs.promises.writeFile(temporal, contenido, 'utf8').then(() => fs.promises.rename(temporal, destino))
}

function leerJson(ruta, reviver) {
  return fs.promises.readFile(ruta, 'utf8').then((texto) => JSON.parse(texto, reviver))
}

class AlmacenSesion {
  constructor(carpeta) {
    this.carpeta = carpeta
    this.creds = null
    this.claves = clavesVacias()
    this.legacy = new Set()
    this.diario = []
    this.cambiosSinCompaction = 0
    this.temporizadorCreds = null
    this.temporizadorDiario = null
    this.temporizadorCompaction = null
    this.flushDiarioEnCurso = null
    this.compactando = false
    this.compactarDespues = false
    this.cerrado = false
    this.cerrando = false
    this.cierre = null
    this.cargado = false
    this.carga = null
    this.escriturasCreds = 0
    this.escriturasDiario = 0
  }

  async cargar() {
    if (this.cargado) return this
    if (this.carga) return this.carga
    this.carga = (async () => {
      await fs.promises.mkdir(this.carpeta, { recursive: true })
      // Credenciales
      try {
        this.creds = await leerJson(path.join(this.carpeta, 'creds.json'), BufferJSON.reviver)
      } catch {
        this.creds = null
      }
      if (!this.creds) {
        const { initAuthCreds } = await import('@whiskeysockets/baileys')
        this.creds = initAuthCreds()
      }
      // Snapshot compacto
      try {
        const snapshot = await leerJson(path.join(this.carpeta, ARCHIVO_CLAVES), BufferJSON.reviver)
        if (snapshot && typeof snapshot === 'object') {
          this.claves = { ...clavesVacias(), ...(snapshot.keys || snapshot) }
        }
      } catch {
        // Sin snapshot: las claves se leerán de los ficheros viejos al usarlas.
      }
      // Diario (si una línea quedó a medias por un corte, se ignora)
      try {
        const texto = await fs.promises.readFile(path.join(this.carpeta, ARCHIVO_DIARIO), 'utf8')
        for (const linea of texto.split(/\r?\n/)) {
          if (!linea.trim()) continue
          try {
            const entrada = JSON.parse(linea, BufferJSON.reviver)
            this.aplicarEntradaDiario(entrada)
          } catch {}
        }
      } catch {}
      this.cargado = true
      return this
    })()
    try {
      return await this.carga
    } finally {
      this.carga = null
    }
  }

  aplicarEntradaDiario(entrada) {
    if (!entrada?.c || !Array.isArray(entrada.u)) return
    const destino = this.claves[entrada.c]
    if (!destino) return
    for (const [id, valor] of entrada.u) {
      if (valor === null || valor === undefined) delete destino[id]
      else destino[id] = valor
    }
  }

  programarCreds() {
    if (this.cerrado || this.cerrando) return
    if (this.temporizadorCreds) return
    this.temporizadorCreds = setTimeout(() => {
      this.temporizadorCreds = null
      void this.guardarCreds()
    }, INTERVALO_CREDS_MS)
    this.temporizadorCreds.unref?.()
  }

  async guardarCreds() {
    if (this.cerrado) return
    this.escriturasCreds++
    try {
      await escribirAtomico(
        path.join(this.carpeta, 'creds.json'),
        JSON.stringify(this.creds, BufferJSON.replacer)
      )
    } catch (error) {
      // La carpeta pudo eliminarse mientras se revinculaba/borraba la sesión.
      if (error?.code === 'ENOENT') return
      console.error(`[auth] No se pudieron guardar las credenciales de ${path.basename(this.carpeta)}:`, error?.message || error)
    }
  }

  registrarCambio(categoria, id, valor) {
    const destino = this.claves[categoria]
    if (!destino) return
    if (valor === null || valor === undefined) delete destino[id]
    else destino[id] = valor
    this.diario.push({ c: categoria, u: [[id, valor ?? null]] })
    this.cambiosSinCompaction++
    this.programarDiario()
    this.programarCompaction()
  }

  programarDiario() {
    if (this.cerrado || this.cerrando || this.temporizadorDiario) return
    this.temporizadorDiario = setTimeout(() => {
      this.temporizadorDiario = null
      void this.volcarDiario()
    }, INTERVALO_DIARIO_MS)
    this.temporizadorDiario.unref?.()
  }

  volcarDiario() {
    if (this.flushDiarioEnCurso) return this.flushDiarioEnCurso
    if (!this.diario.length) return Promise.resolve()
    const lote = this.diario
    this.diario = []
    const texto = lote
      .map((entrada) => JSON.stringify(entrada, BufferJSON.replacer))
      .join('\n') + '\n'
    this.flushDiarioEnCurso = fs.promises
      .appendFile(path.join(this.carpeta, ARCHIVO_DIARIO), texto, 'utf8')
      .then(async () => {
        this.escriturasDiario++
        // Si el diario crece demasiado, compacta sin esperar al temporizador.
        try {
          const info = await fs.promises.stat(path.join(this.carpeta, ARCHIVO_DIARIO))
          if (info.size > COMPACTAR_SI_DIARIO_BYTES) void this.compactar()
        } catch {}
      })
      .catch((error) => {
        // La sesión pudo borrarse mientras se escribía el diario.
        if (error?.code === 'ENOENT') return
        // No perder el lote si el disco falló puntualmente.
        this.diario = lote.concat(this.diario)
        console.error(`[auth] No se pudo escribir el diario de ${path.basename(this.carpeta)}:`, error?.message || error)
      })
      .finally(() => {
        this.flushDiarioEnCurso = null
      })
    return this.flushDiarioEnCurso
  }

  programarCompaction() {
    if (this.cerrado || this.cerrando || this.temporizadorCompaction) return
    const intervalo = this.cambiosSinCompaction >= COMPACTAR_TRAS_CAMBIOS
      ? Math.min(INTERVALO_COMPACTO_MS, 2_000)
      : INTERVALO_COMPACTO_MS
    this.temporizadorCompaction = setTimeout(() => {
      this.temporizadorCompaction = null
      void this.compactar()
    }, intervalo)
    this.temporizadorCompaction.unref?.()
  }

  async compactar({ forzar = false } = {}) {
    if (this.cerrado || this.compactando) {
      if (this.compactando) this.compactarDespues = true
      return false
    }
    if (!forzar && this.cambiosSinCompaction < 1) return false
    this.compactando = true
    const inicioCompacto = Date.now()
    try {
      await this.volcarDiario()
      await escribirAtomico(
        path.join(this.carpeta, ARCHIVO_CLAVES),
        JSON.stringify({ v: 1, keys: this.claves }, BufferJSON.replacer)
      )
      // El snapshot ya contiene todo lo del diario: se puede truncar.
      await fs.promises.writeFile(path.join(this.carpeta, ARCHIVO_DIARIO), '', 'utf8')
      this.cambiosSinCompaction = 0
      if (LIMPIAR_LEGACY) void this.limpiarLegacy()
      const msCompacto = Date.now() - inicioCompacto
      if (msCompacto > 500) {
        const claves = Object.values(this.claves || {})
          .reduce((total, categoria) => total + (categoria ? Object.keys(categoria).length : 0), 0)
        console.warn(`[auth] compactar ${path.basename(this.carpeta)}: ${msCompacto} ms (${claves} claves)`)
      }
      return true
    } catch (error) {
      if (error?.code === 'ENOENT') return false
      console.error(`[auth] No se pudo compactar ${path.basename(this.carpeta)}:`, error?.message || error)
      return false
    } finally {
      this.compactando = false
      if (this.compactarDespues) {
        this.compactarDespues = false
        this.programarCompaction()
      }
    }
  }

  /**
   * Borra SOLO los ficheros de claves del formato viejo cuyas claves ya están
   * en memoria (y por tanto en auth-keys.json). Las claves aún no leídas se
   * conservan: borrarlas rompería el descifrado de esa sesión.
   */
  async limpiarLegacy() {
    const esperados = new Set()
    for (const [tipo, categoria] of Object.entries(MAPA_CLAVES)) {
      for (const id of Object.keys(this.claves[categoria] || {})) {
        esperados.add(`${tipo}-${claveFichero(id)}.json`)
      }
    }
    if (!esperados.size) return 0
    let nombres
    try {
      nombres = await fs.promises.readdir(this.carpeta)
    } catch {
      return 0
    }
    let borrados = 0
    for (const nombre of nombres) {
      if (!REGEX_CLAVE_LEGACY.test(nombre) || !esperados.has(nombre)) continue
      try {
        await fs.promises.unlink(path.join(this.carpeta, nombre))
        borrados++
        this.legacy.delete(nombre)
      } catch {}
    }
    if (borrados) {
      console.log(`[auth] ${path.basename(this.carpeta)}: ${borrados} fichero(s) de clave migrados a auth-keys.json.`)
    }
    return borrados
  }

  async leerLegacy(categoria, id) {
    const tipo = Object.keys(MAPA_CLAVES).find((clave) => MAPA_CLAVES[clave] === categoria)
    if (!tipo) return null
    const nombre = `${tipo}-${claveFichero(id)}.json`
    if (this.legacy.has(nombre)) return null
    let valor = null
    try {
      valor = await leerJson(path.join(this.carpeta, nombre), BufferJSON.reviver)
    } catch {
      valor = null
    }
    this.legacy.add(nombre)
    if (valor !== null) {
      // Se memoriza y se marca para persistirse en el formato compacto.
      this.registrarCambio(categoria, id, valor)
    }
    return valor
  }

  async obtenerClaves(tipo, ids) {
    const categoria = MAPA_CLAVES[tipo]
    if (!categoria) return {}
    const destino = {}
    await Promise.all(ids.map(async (id) => {
      let valor = this.claves[categoria]?.[id]
      if (valor === undefined) valor = await this.leerLegacy(categoria, id)
      if (tipo === 'app-state-sync-key' && valor) {
        valor = proto.Message.AppStateSyncKeyData.fromObject(valor)
      }
      destino[id] = valor ?? null
    }))
    return destino
  }

  guardarClaves(datos) {
    for (const tipo in datos) {
      const categoria = MAPA_CLAVES[tipo]
      if (!categoria) continue
      const cambios = datos[tipo] || {}
      for (const id in cambios) {
        this.registrarCambio(categoria, id, cambios[id])
      }
    }
  }

  async cerrar({ forzar = true } = {}) {
    if (this.cerrado) return this.cierre
    if (this.cerrando) return this.cierre
    this.cerrando = true
    if (this.temporizadorCreds) clearTimeout(this.temporizadorCreds)
    if (this.temporizadorDiario) clearTimeout(this.temporizadorDiario)
    if (this.temporizadorCompaction) clearTimeout(this.temporizadorCompaction)
    this.temporizadorCreds = null
    this.temporizadorDiario = null
    this.temporizadorCompaction = null
    this.cierre = (async () => {
      try {
        await this.volcarDiario()
        await this.guardarCreds()
        if (forzar) await this.compactar({ forzar: true })
      } catch {}
      this.cerrado = true
      this.cerrando = false
    })()
    return this.cierre
  }
}

async function crearAlmacen(carpeta) {
  const absoluta = path.resolve(carpeta)
  const existente = almacenes.get(absoluta)
  if (existente && !existente.cerrado && !existente.cerrando) return existente
  const enCurso = creandoAlmacen.get(absoluta)
  if (enCurso) return enCurso
  const promesa = (async () => {
    const almacen = new AlmacenSesion(absoluta)
    almacenes.set(absoluta, almacen)
    await almacen.cargar()
    return almacen
  })()
  creandoAlmacen.set(absoluta, promesa)
  try {
    return await promesa
  } finally {
    creandoAlmacen.delete(absoluta)
  }
}

/**
 * Olvida el almacén de una sesión cuando se elimina o se revincula. Así la
 * próxima conexión lee las credenciales nuevas y no las viejas que quedaron
 * en memoria.
 */
export async function olvidarAuthStore(carpeta) {
  const absoluta = path.resolve(carpeta)
  const almacen = almacenes.get(absoluta)
  if (!almacen) return false
  almacenes.delete(absoluta)
  await almacen.cerrar().catch(() => {})
  return true
}

/**
 * Reemplazo de `useMultiFileAuthState` con memoria + diario.
 * Misma forma: `{ state: { creds, keys }, saveCreds }`.
 */
export async function useMemoryAuthState(carpeta, opciones = {}) {
  const almacen = await crearAlmacen(carpeta)
  return {
    state: {
      creds: almacen.creds,
      keys: {
        get: (tipo, ids) => almacen.obtenerClaves(tipo, ids),
        set: (datos) => almacen.guardarClaves(datos)
      }
    },
    saveCreds: (forzar = false) => {
      if (forzar) return almacen.guardarCreds()
      almacen.programarCreds()
      return Promise.resolve()
    },
    flush: () => almacen.compactar({ forzar: true }),
    close: () => almacen.cerrar(),
    estadisticas: () => ({
      cambios: almacen.cambiosSinCompaction,
      escriturasDiario: almacen.escriturasDiario,
      escriturasCreds: almacen.escriturasCreds
    })
  }
}

/** Vuelca todos los almacenes abiertos (apagado controlado). */
export async function flushAuthStores({ cerrar = false } = {}) {
  const lista = [...almacenes.values()]
  await Promise.allSettled(lista.map((almacen) =>
    cerrar ? almacen.cerrar() : almacen.compactar({ forzar: true })
  ))
  if (cerrar) almacenes.clear()
}

export function estadisticasAuthStores() {
  let cambios = 0
  let diario = 0
  let claves = 0
  for (const almacen of almacenes.values()) {
    cambios += almacen.cambiosSinCompaction
    diario += almacen.diario.length
    for (const categoria of Object.values(almacen.claves || {})) {
      if (categoria && typeof categoria === 'object') claves += Object.keys(categoria).length
    }
  }
  return { sesiones: almacenes.size, claves, cambiosPendientes: cambios, entradasDiario: diario }
}
