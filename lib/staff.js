import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync
} from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { jidsSeSolapan, candidatosJidRemitente } from './group-participant.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIR_RAIZ = join(__dirname, '..')
const RUTA_STAFF_PRINCIPAL = join(DIR_RAIZ, 'storage', 'staff.json')

const cachePorRuta = new Map()
const bloqueosPorRuta = new Set()
let migracionLegacyHecha = false

function carpetaSerbot() {
  return join(DIR_RAIZ, global.bot || 'Serbot')
}

function dataVacia() {
  return { staff: [] }
}

function normalizarLista(raw) {
  if (Array.isArray(raw)) return { staff: [...raw] }
  if (Array.isArray(raw?.staff) && raw.staff.length) return { staff: [...raw.staff] }
  if (Array.isArray(raw?.main) && raw.main.length) return { staff: [...raw.main] }
  if (Array.isArray(raw?.staff)) return { staff: [...raw.staff] }
  if (Array.isArray(raw?.main)) return { staff: [...raw.main] }
  return dataVacia()
}

export function esBotPrincipal(conn) {
  if (!conn) return true
  if (global.conn && conn === global.conn) return true
  const mio = numeroBotDe(conn)
  const principal = numeroBotDe(global.conn)
  if (mio && principal) return mio === principal
  return Boolean(global.conn && conn === global.conn)
}

export function numeroBotDe(conn) {
  return digitosDe(conn?.user?.jid || conn?.user?.id)
}

export function claveStaffBot(conn) {
  if (esBotPrincipal(conn)) return 'main'
  return numeroBotDe(conn) || 'unknown'
}

export function rutaStaffDe(conn) {
  if (esBotPrincipal(conn)) return RUTA_STAFF_PRINCIPAL
  const num = numeroBotDe(conn)
  if (!num || num === 'unknown') return RUTA_STAFF_PRINCIPAL
  return join(carpetaSerbot(), num, 'staff.json')
}

function leerJsonSiExiste(ruta) {
  if (!existsSync(ruta)) return null
  try {
    const raw = readFileSync(ruta, 'utf8')
    if (!String(raw || '').trim()) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function migrarLegacyCompartidoSiHaceFalta() {
  if (migracionLegacyHecha) return
  migracionLegacyHecha = true

  const raw = leerJsonSiExiste(RUTA_STAFF_PRINCIPAL)
  if (!raw) return

  const esLegacy = Array.isArray(raw?.main) || (raw?.subs && typeof raw.subs === 'object')
  if (!esLegacy) return

  const staffPrincipal =
    Array.isArray(raw.staff) && raw.staff.length
      ? raw.staff
      : Array.isArray(raw.main)
        ? raw.main
        : []

  persistir(RUTA_STAFF_PRINCIPAL, { staff: staffPrincipal }, { permitirVaciar: true })

  for (const [num, lista] of Object.entries(raw.subs || {})) {
    if (!num || !Array.isArray(lista) || !lista.length) continue
    const rutaSub = join(carpetaSerbot(), String(num), 'staff.json')
    if (existsSync(rutaSub)) continue
    try {
      mkdirSync(dirname(rutaSub), { recursive: true })
      persistir(rutaSub, { staff: lista }, { permitirVaciar: true })
      console.log(`[staff] Migrado staff del subbot +${num} → ${rutaSub}`)
    } catch (e) {
      console.warn(`[staff] No se pudo migrar sub +${num}:`, e?.message || e)
    }
  }

  console.log('[staff] Formato legacy migrado a archivos por bot')
}

function contarStaff(data) {
  return Array.isArray(data?.staff) ? data.staff.length : 0
}


function persistir(ruta, data, { permitirVaciar = false } = {}) {
  const payload = normalizarLista(data)
  const dir = dirname(ruta)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  if (!permitirVaciar && contarStaff(payload) === 0) {
    const enDisco = normalizarLista(leerJsonSiExiste(ruta) || {})
    const enCache = cachePorRuta.has(ruta) ? normalizarLista(cachePorRuta.get(ruta)) : null
    if (contarStaff(enDisco) > 0) {
      console.warn(`[staff] Bloqueado guardado vacío → se mantienen ${contarStaff(enDisco)} en ${ruta}`)
      cachePorRuta.set(ruta, enDisco)
      return enDisco
    }
    if (contarStaff(enCache) > 0) {
      console.warn(`[staff] Bloqueado guardado vacío → se mantiene cache (${contarStaff(enCache)})`)
      return enCache
    }
  }

  writeFileSync(ruta, JSON.stringify(payload, null, 2), 'utf8')
  cachePorRuta.set(ruta, payload)
  return payload
}

function asegurarArchivo(ruta) {
  const dir = dirname(ruta)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  if (!existsSync(ruta)) {
    writeFileSync(ruta, JSON.stringify(dataVacia(), null, 2), 'utf8')
  }
}

function leerDesdeDisco(ruta) {
  asegurarArchivo(ruta)
  try {
    const raw = leerJsonSiExiste(ruta)
    if (raw == null) return null
    return normalizarLista(raw)
  } catch (e) {
    console.warn(`[staff] JSON ilegible (${ruta}):`, e?.message || e)
    return null
  }
}

function conBloqueoRuta(ruta, fn) {
  if (bloqueosPorRuta.has(ruta)) {
    throw new Error(`[staff] Operación concurrente en ${ruta}`)
  }
  bloqueosPorRuta.add(ruta)
  try {
    return fn()
  } finally {
    bloqueosPorRuta.delete(ruta)
  }
}

function cargarDeRuta(ruta, forzar = false) {
  migrarLegacyCompartidoSiHaceFalta()

  const cache = cachePorRuta.has(ruta) ? normalizarLista(cachePorRuta.get(ruta)) : null
  if (!forzar && cache) return cache

  const desdeDisco = leerDesdeDisco(ruta)

  if (desdeDisco && contarStaff(desdeDisco) > 0) {
    cachePorRuta.set(ruta, desdeDisco)
    return normalizarLista(desdeDisco)
  }

  if (cache && contarStaff(cache) > 0) {
    if (desdeDisco && contarStaff(desdeDisco) === 0) {
      console.warn(`[staff] Disco vacío, se reescribe desde cache (${contarStaff(cache)})`)
      persistir(ruta, cache, { permitirVaciar: false })
    }
    return cache
  }

  if (desdeDisco) {
    cachePorRuta.set(ruta, desdeDisco)
    return normalizarLista(desdeDisco)
  }

  const vacio = dataVacia()
  cachePorRuta.set(ruta, vacio)
  return normalizarLista(vacio)
}

export function cargarStaff(forzar = false) {
  return cargarDeRuta(RUTA_STAFF_PRINCIPAL, forzar)
}

export function cargarStaffBot(conn, forzar = false) {
  return cargarDeRuta(rutaStaffDe(conn), forzar)
}

export function guardarStaff(data, conn = null) {
  const ruta = conn ? rutaStaffDe(conn) : RUTA_STAFF_PRINCIPAL
  return conBloqueoRuta(ruta, () => persistir(ruta, data))
}

function digitosDe(valor = '') {
  return String(valor || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

function esJidLid(jid = '') {
  const j = String(jid || '')
  return j.endsWith('@lid') || j.endsWith('@hosted.lid')
}

function esJidPn(jid = '') {
  const j = String(jid || '')
  return j.endsWith('@s.whatsapp.net') || j.endsWith('@c.us')
}

function crearIdsOwner(numero) {
  const numeroLimpio = String(numero || '').replace(/[^0-9]/g, '')
  if (!numeroLimpio) return []
  return [
    numeroLimpio + '@s.whatsapp.net',
    numeroLimpio + '@lid',
    numeroLimpio + '@hosted.lid'
  ]
}

function idsDesdeEntrada(entrada) {
  const ids = new Set()
  for (const id of entrada?.ids || []) {
    if (!id) continue
    const s = String(id)
    ids.add(s)
    for (const j of crearIdsOwner(s)) ids.add(j)
  }
  for (const n of entrada?.numbers || []) {
    for (const j of crearIdsOwner(n)) ids.add(j)
  }
  for (const l of entrada?.lids || []) {
    for (const j of crearIdsOwner(l)) ids.add(j)
  }
  return [...ids]
}

function buscarEnLista(lista, idsObjetivo = []) {
  for (let i = 0; i < lista.length; i++) {
    if (jidsSeSolapan(idsDesdeEntrada(lista[i]), idsObjetivo)) {
      return { index: i, entrada: lista[i] }
    }
  }
  return null
}

export function listarStaff(conn) {
  const data = cargarStaffBot(conn)
  return [...(data.staff || [])]
}


export function obtenerIdsStaffComoOwner(conn) {
  const ids = new Set()
  for (const entrada of listarStaff(conn)) {
    for (const j of idsDesdeEntrada(entrada)) ids.add(j)
  }
  return [...ids]
}

export function idsOwnerDesdeConfig() {
  const ids = new Set()
  for (const entrada of global.owner || []) {
    const numero = Array.isArray(entrada) ? entrada[0] : entrada
    for (const j of crearIdsOwner(numero)) ids.add(j)
  }
  for (const entrada of global.ownerLid || []) {
    const numero = Array.isArray(entrada) ? entrada[0] : entrada
    for (const j of crearIdsOwner(numero)) ids.add(j)
  }
  return [...ids]
}

export function esOwnerConfig(m, conn) {
  if (!m) return false
  return jidsSeSolapan(candidatosJidRemitente(m, conn), idsOwnerDesdeConfig())
}

export function esIdsOwnerConfig(idsObjetivo = []) {
  return jidsSeSolapan(idsObjetivo || [], idsOwnerDesdeConfig())
}

/** ¿Puede usar /mod en este bot? */
export function puedeUsarMod(m, conn) {
  if (!m || !conn) return false
  if (esOwnerConfig(m, conn)) return true
  if (esBotPrincipal(conn)) return false
  if (m.fromMe) return true
  const botIds = crearIdsOwner(numeroBotDe(conn))
  return jidsSeSolapan(candidatosJidRemitente(m, conn), botIds)
}

export function buscarStaffPorIds(idsObjetivo = [], conn) {
  const clave = claveStaffBot(conn)
  const lista = listarStaff(conn)
  const hallado = buscarEnLista(lista, idsObjetivo)
  if (!hallado) return null
  return { ...hallado, clave }
}

export function construirEntradaStaff({
  name = 'Staff',
  numbers = [],
  lids = [],
  ids = [],
  addedBy = '',
  addedAt = Date.now(),
  scope = 'main',
  bot = 'main'
} = {}) {
  const numbersClean = [...new Set(numbers.map(digitosDe).filter(d => d.length >= 6))]
  const lidsClean = [...new Set(lids.map(digitosDe).filter(d => d.length >= 6))]
  const idsClean = new Set()

  for (const id of ids) {
    if (!id) continue
    const s = String(id)
    idsClean.add(s)
    const d = digitosDe(s)
    if (d) {
      for (const j of crearIdsOwner(d)) idsClean.add(j)
    }
  }
  for (const n of numbersClean) for (const j of crearIdsOwner(n)) idsClean.add(j)
  for (const l of lidsClean) for (const j of crearIdsOwner(l)) idsClean.add(j)

  return {
    name: String(name || 'Staff').slice(0, 40),
    numbers: numbersClean,
    lids: lidsClean,
    ids: [...idsClean],
    scope: scope === 'main' ? 'main' : 'sub',
    bot: String(bot || 'main'),
    addedBy: String(addedBy || ''),
    addedAt: Number(addedAt) || Date.now()
  }
}

export function agregarStaff(entrada, conn) {
  const ruta = rutaStaffDe(conn)
  const clave = claveStaffBot(conn)

  return conBloqueoRuta(ruta, () => {
    const data = cargarDeRuta(ruta, true)
    const lista = Array.isArray(data.staff) ? [...data.staff] : []
    const hallado = buscarEnLista(lista, entrada.ids || [])

    const conMeta = {
      ...entrada,
      scope: clave === 'main' ? 'main' : 'sub',
      bot: clave
    }

    if (hallado) {
      const prev = hallado.entrada
      const merged = construirEntradaStaff({
        name: conMeta.name || prev.name,
        numbers: [...(prev.numbers || []), ...(conMeta.numbers || [])],
        lids: [...(prev.lids || []), ...(conMeta.lids || [])],
        ids: [...(prev.ids || []), ...(conMeta.ids || [])],
        addedBy: prev.addedBy || conMeta.addedBy,
        addedAt: prev.addedAt || conMeta.addedAt,
        scope: conMeta.scope,
        bot: clave
      })
      lista[hallado.index] = merged
      persistir(ruta, { staff: lista })
      return { created: false, entrada: merged, scope: clave, file: ruta }
    }

    lista.push(conMeta)
    persistir(ruta, { staff: lista })
    return { created: true, entrada: conMeta, scope: clave, file: ruta }
  })
}

export function quitarStaffPorIds(idsObjetivo = [], conn) {
  const ruta = rutaStaffDe(conn)

  return conBloqueoRuta(ruta, () => {
    const data = cargarDeRuta(ruta, true)
    const lista = Array.isArray(data.staff) ? [...data.staff] : []
    const hallado = buscarEnLista(lista, idsObjetivo)
    if (!hallado) return null

    const [eliminado] = lista.splice(hallado.index, 1)
    persistir(ruta, { staff: lista }, { permitirVaciar: true })
    return eliminado
  })
}

export function clasificarIds(ids = []) {
  const numbers = []
  const lids = []
  for (const id of ids) {
    const d = digitosDe(id)
    if (!d) continue
    if (esJidLid(id) || d.length >= 14) lids.push(d)
    else if (esJidPn(id) || (d.length >= 8 && d.length <= 13)) numbers.push(d)
    else lids.push(d)
  }
  return {
    numbers: [...new Set(numbers)],
    lids: [...new Set(lids)]
  }
}

export function etiquetaScope(conn) {
  const clave = claveStaffBot(conn)
  return clave === 'main' ? 'Principal' : `Sub-Bot (+${clave})`
}

/** Ruta relativa para mostrar en mensajes */
export function rutaStaffRelativa(conn) {
  const abs = rutaStaffDe(conn)
  const rel = abs.startsWith(DIR_RAIZ) ? abs.slice(DIR_RAIZ.length + 1) : abs
  return rel.replace(/\\/g, '/')
}

export {
  obtenerIdsStaffComoOwner as getStaffOwnerIds,
  esOwnerConfig as isConfigOwner,
  puedeUsarMod as canUseMod,
  esIdsOwnerConfig as isConfigOwnerIds,
  agregarStaff as addStaff,
  quitarStaffPorIds as removeStaffByIds,
  listarStaff as listStaff,
  cargarStaff as loadStaff,
  cargarStaffBot as loadStaffBot,
  rutaStaffDe as staffFilePathFor,
  rutaStaffRelativa as staffRelativePath,
  RUTA_STAFF_PRINCIPAL as staffFilePath
}
