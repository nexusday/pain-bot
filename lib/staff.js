import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  copyFileSync
} from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { jidsSeSolapan } from './group-participant.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIR_RAIZ = join(__dirname, '..')
const RUTA_STAFF_PRINCIPAL = join(DIR_RAIZ, 'storage', 'staff.json')

/** cache por ruta de archivo */
const cachePorRuta = new Map()
const bloqueosPorRuta = new Set()
let migracionLegacyHecha = false

function carpetaSerbot() {
  return join(DIR_RAIZ, global.bot || 'Serbot')
}

function dataVacia() {
  return { staff: [] }
}

/** Acepta formatos viejos y nuevos → siempre { staff: [] } */
function normalizarLista(raw) {
  if (Array.isArray(raw)) return { staff: [...raw] }
  if (Array.isArray(raw?.staff)) return { staff: [...raw.staff] }
  // Legacy compartido: { main, subs }
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

/** 'main' | número del subbot */
export function claveStaffBot(conn) {
  if (esBotPrincipal(conn)) return 'main'
  return numeroBotDe(conn) || 'unknown'
}

/** Ruta del staff.json de ESTE bot (principal o sub). */
export function rutaStaffDe(conn) {
  if (esBotPrincipal(conn)) return RUTA_STAFF_PRINCIPAL
  const num = numeroBotDe(conn)
  if (!num || num === 'unknown') return RUTA_STAFF_PRINCIPAL
  return join(carpetaSerbot(), num, 'staff.json')
}

function rutasAuxiliares(ruta) {
  return { tmp: ruta + '.tmp', bak: ruta + '.bak' }
}

/**
 * Migra una sola vez el formato viejo storage/staff.json { main, subs }
 * → storage/staff.json { staff } + Serbot/<num>/staff.json
 */
function migrarLegacyCompartidoSiHaceFalta() {
  if (migracionLegacyHecha) return
  migracionLegacyHecha = true

  if (!existsSync(RUTA_STAFF_PRINCIPAL)) return

  let raw
  try {
    raw = JSON.parse(readFileSync(RUTA_STAFF_PRINCIPAL, 'utf8'))
  } catch {
    return
  }

  const esLegacy = Array.isArray(raw?.main) || (raw?.subs && typeof raw.subs === 'object')
  if (!esLegacy) return

  const staffPrincipal = Array.isArray(raw.main) ? raw.main : (Array.isArray(raw.staff) ? raw.staff : [])
  escribirAtomico(RUTA_STAFF_PRINCIPAL, { staff: staffPrincipal }, { hacerBackup: true })

  for (const [num, lista] of Object.entries(raw.subs || {})) {
    if (!num || !Array.isArray(lista) || !lista.length) continue
    const rutaSub = join(carpetaSerbot(), String(num), 'staff.json')
    if (existsSync(rutaSub)) continue
    try {
      mkdirSync(dirname(rutaSub), { recursive: true })
      escribirAtomico(rutaSub, { staff: lista }, { hacerBackup: false })
      console.log(`[staff] Migrado staff del subbot +${num} → ${rutaSub}`)
    } catch (e) {
      console.warn(`[staff] No se pudo migrar sub +${num}:`, e?.message || e)
    }
  }

  console.log('[staff] Formato legacy migrado a archivos por bot')
}

function asegurarArchivo(ruta) {
  const dir = dirname(ruta)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  if (!existsSync(ruta)) {
    escribirAtomico(ruta, dataVacia(), { hacerBackup: false })
  }
}

function escribirAtomico(ruta, data, { hacerBackup = true } = {}) {
  const payload = normalizarLista(data)
  const json = JSON.stringify(payload, null, 2)
  const { tmp, bak } = rutasAuxiliares(ruta)

  const dir = dirname(ruta)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  writeFileSync(tmp, json, 'utf8')

  if (hacerBackup && existsSync(ruta)) {
    try {
      copyFileSync(ruta, bak)
    } catch {}
  }

  try {
    renameSync(tmp, ruta)
  } catch {
    writeFileSync(ruta, json, 'utf8')
  }

  cachePorRuta.set(ruta, payload)
  return payload
}

function leerDesdeDisco(ruta) {
  asegurarArchivo(ruta)

  const intentar = (archivo) => {
    if (!existsSync(archivo)) return null
    const raw = readFileSync(archivo, 'utf8')
    if (!String(raw || '').trim()) return null
    return normalizarLista(JSON.parse(raw))
  }

  try {
    const data = intentar(ruta)
    if (data) return data
  } catch (e) {
    console.warn(`[staff] JSON ilegible (${ruta}):`, e?.message || e)
  }

  const { bak } = rutasAuxiliares(ruta)
  try {
    const desdeBak = intentar(bak)
    if (desdeBak) {
      console.warn(`[staff] Restaurando desde backup: ${bak}`)
      escribirAtomico(ruta, desdeBak, { hacerBackup: false })
      return desdeBak
    }
  } catch (e) {
    console.warn(`[staff] Backup falló (${bak}):`, e?.message || e)
  }

  return null
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

  if (!forzar && cachePorRuta.has(ruta)) {
    return normalizarLista(cachePorRuta.get(ruta))
  }

  const desdeDisco = leerDesdeDisco(ruta)
  if (desdeDisco) {
    cachePorRuta.set(ruta, desdeDisco)
    return normalizarLista(desdeDisco)
  }

  if (cachePorRuta.has(ruta)) {
    return normalizarLista(cachePorRuta.get(ruta))
  }

  const vacio = dataVacia()
  cachePorRuta.set(ruta, vacio)
  return normalizarLista(vacio)
}

/** @deprecated usar cargarStaffBot(conn) — mantiene compat leyendo el principal */
export function cargarStaff(forzar = false) {
  return cargarDeRuta(RUTA_STAFF_PRINCIPAL, forzar)
}

export function cargarStaffBot(conn, forzar = false) {
  return cargarDeRuta(rutaStaffDe(conn), forzar)
}

export function guardarStaff(data, conn = null) {
  const ruta = conn ? rutaStaffDe(conn) : RUTA_STAFF_PRINCIPAL
  return conBloqueoRuta(ruta, () => escribirAtomico(ruta, data))
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
    numeroLimpio + '@lid'
  ]
}

function candidatosSender(m) {
  return [
    m?.sender,
    m?.participant,
    m?.key?.participant,
    m?.key?.participantAlt,
    m?.key?.remoteJidAlt,
    m?.senderPn
  ].filter(Boolean)
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

/** IDs staff como owner — solo del bot actual (su propio archivo). */
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
  return jidsSeSolapan(candidatosSender(m), idsOwnerDesdeConfig())
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
  return jidsSeSolapan(candidatosSender(m), botIds)
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
    const data = leerDesdeDisco(ruta) || cachePorRuta.get(ruta) || dataVacia()
    const lista = Array.isArray(data.staff) ? data.staff : []
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
      escribirAtomico(ruta, { staff: lista })
      return { created: false, entrada: merged, scope: clave, file: ruta }
    }

    lista.push(conMeta)
    escribirAtomico(ruta, { staff: lista })
    return { created: true, entrada: conMeta, scope: clave, file: ruta }
  })
}

export function quitarStaffPorIds(idsObjetivo = [], conn) {
  const ruta = rutaStaffDe(conn)

  return conBloqueoRuta(ruta, () => {
    const data = leerDesdeDisco(ruta) || cachePorRuta.get(ruta) || dataVacia()
    const lista = Array.isArray(data.staff) ? data.staff : []
    const hallado = buscarEnLista(lista, idsObjetivo)
    if (!hallado) return null

    const [eliminado] = lista.splice(hallado.index, 1)
    escribirAtomico(ruta, { staff: lista })
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
