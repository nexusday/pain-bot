import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { jidsSeSolapan } from './group-participant.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA_STAFF = join(__dirname, '../storage/staff.json')

let cacheStaff = null

function asegurarArchivo() {
  const dir = dirname(RUTA_STAFF)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  if (!existsSync(RUTA_STAFF)) {
    writeFileSync(RUTA_STAFF, JSON.stringify({ main: [], subs: {} }, null, 2), 'utf8')
  }
}

function normalizarData(raw) {

  if (Array.isArray(raw?.staff) && !Array.isArray(raw?.main)) {
    return { main: raw.staff, subs: {} }
  }
  return {
    main: Array.isArray(raw?.main) ? raw.main : [],
    subs: raw?.subs && typeof raw.subs === 'object' && !Array.isArray(raw.subs) ? raw.subs : {}
  }
}

export function cargarStaff(forzar = false) {
  if (cacheStaff && !forzar) return cacheStaff
  asegurarArchivo()
  try {
    cacheStaff = normalizarData(JSON.parse(readFileSync(RUTA_STAFF, 'utf8')))
  } catch {
    cacheStaff = { main: [], subs: {} }
  }
  return cacheStaff
}

export function guardarStaff(data) {
  asegurarArchivo()
  const payload = normalizarData(data)
  writeFileSync(RUTA_STAFF, JSON.stringify(payload, null, 2), 'utf8')
  cacheStaff = payload
  return payload
}

function crearIdsOwner(numero) {
  const numeroLimpio = String(numero || '').replace(/[^0-9]/g, '')
  if (!numeroLimpio) return []
  return [
    numeroLimpio + '@s.whatsapp.net',
    numeroLimpio + '@lid'
  ]
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

export function numeroBotDe(conn) {
  return digitosDe(conn?.user?.jid || conn?.user?.id)
}

export function esBotPrincipal(conn) {
  if (!conn) return true
  if (conn === global.conn) return true
  const mio = numeroBotDe(conn)
  const principal = numeroBotDe(global.conn)
  return Boolean(mio && principal && mio === principal)
}

/** 'main' | número del subbot */
export function claveStaffBot(conn) {
  if (esBotPrincipal(conn)) return 'main'
  return numeroBotDe(conn) || 'unknown'
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

function listaStaffDeClave(data, clave) {
  if (clave === 'main') return Array.isArray(data.main) ? data.main : []
  if (!data.subs[clave]) data.subs[clave] = []
  return data.subs[clave]
}

/** Staff solo de este bot (principal o sub). No mezcla scopes. */
export function listarStaff(conn) {
  const data = cargarStaff()
  const clave = claveStaffBot(conn)
  if (clave === 'main') return [...(data.main || [])]
  return [...(data.subs?.[clave] || [])]
}

/** IDs staff como owner — solo del bot actual. */
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

/** Solo owners de config.js (nunca staff ni número de subbot). */
export function esOwnerConfig(m, conn) {
  if (!m) return false
  const ids = idsOwnerDesdeConfig()
  return jidsSeSolapan(candidatosSender(m), ids)
}

export function esIdsOwnerConfig(idsObjetivo = []) {
  return jidsSeSolapan(idsObjetivo || [], idsOwnerDesdeConfig())
}

/** ¿Puede usar /mod en este bot? */
export function puedeUsarMod(m, conn) {
  if (!m || !conn) return false
  // Owners de config.js: en principal y en todos los subbots
  if (esOwnerConfig(m, conn)) return true
  // En el principal solo config
  if (esBotPrincipal(conn)) return false
  // En subbot: su propio número (dueño del sub)
  if (m.fromMe) return true
  const botIds = crearIdsOwner(numeroBotDe(conn))
  return jidsSeSolapan(candidatosSender(m), botIds)
}

export function buscarStaffPorIds(idsObjetivo = [], conn) {
  const data = cargarStaff()
  const clave = claveStaffBot(conn)
  const lista = listaStaffDeClave(data, clave)
  for (let i = 0; i < lista.length; i++) {
    if (jidsSeSolapan(idsDesdeEntrada(lista[i]), idsObjetivo)) {
      return { index: i, entrada: lista[i], clave }
    }
  }
  return null
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
  const data = cargarStaff(true)
  const clave = claveStaffBot(conn)
  const lista = listaStaffDeClave(data, clave)
  const hallado = buscarStaffPorIds(entrada.ids || [], conn)

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
    if (clave === 'main') data.main = lista
    else data.subs[clave] = lista
    guardarStaff(data)
    return { created: false, entrada: merged, scope: clave }
  }

  lista.push(conMeta)
  if (clave === 'main') data.main = lista
  else data.subs[clave] = lista
  guardarStaff(data)
  return { created: true, entrada: conMeta, scope: clave }
}

export function quitarStaffPorIds(idsObjetivo = [], conn) {
  const data = cargarStaff(true)
  const hallado = buscarStaffPorIds(idsObjetivo, conn)
  if (!hallado) return null
  const lista = listaStaffDeClave(data, hallado.clave)
  const [eliminado] = lista.splice(hallado.index, 1)
  if (hallado.clave === 'main') data.main = lista
  else data.subs[hallado.clave] = lista
  guardarStaff(data)
  return eliminado
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

export {
  obtenerIdsStaffComoOwner as getStaffOwnerIds,
  esOwnerConfig as isConfigOwner,
  puedeUsarMod as canUseMod,
  esIdsOwnerConfig as isConfigOwnerIds,
  agregarStaff as addStaff,
  quitarStaffPorIds as removeStaffByIds,
  listarStaff as listStaff,
  cargarStaff as loadStaff,
  RUTA_STAFF as staffFilePath
}
