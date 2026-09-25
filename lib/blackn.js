import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { candidatosJidRemitente, jidsSeSolapan } from './group-participant.js'
import { esBotPrincipal, numeroBotDe } from './staff.js'

const DIR_RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const RUTA_PRINCIPAL = join(DIR_RAIZ, 'storage', 'blackn.json')
const cache = new Map()

function rutaDe(conn) {
  if (esBotPrincipal(conn)) return RUTA_PRINCIPAL
  const num = numeroBotDe(conn)
  if (!num) return RUTA_PRINCIPAL
  return join(DIR_RAIZ, global.bot || 'Serbot', num, 'blackn.json')
}

function leer(conn) {
  const ruta = rutaDe(conn)
  if (cache.has(ruta)) return cache.get(ruta)
  let lista = []
  if (existsSync(ruta)) {
    try {
      const raw = JSON.parse(readFileSync(ruta, 'utf8'))
      if (Array.isArray(raw?.list)) lista = raw.list
      else if (Array.isArray(raw)) lista = raw
    } catch {}
  }
  cache.set(ruta, lista)
  return lista
}

function guardar(conn, lista) {
  const ruta = rutaDe(conn)
  const carpeta = dirname(ruta)
  if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true })
  writeFileSync(ruta, JSON.stringify({ list: lista }, null, 2))
  cache.set(ruta, lista)
}

export function listarBlackn(conn) {
  return [...leer(conn)]
}

export function estaEnBlackn(m, conn) {
  if (!m || !conn || m.fromMe) return false
  const lista = leer(conn)
  if (!lista.length) return false
  const ids = candidatosJidRemitente(m, conn)
  return lista.some(entrada => jidsSeSolapan(ids, entrada?.ids || []))
}

export function agregarBlackn(conn, entrada) {
  const lista = leer(conn)
  const ya = lista.find(item => jidsSeSolapan(item?.ids || [], entrada.ids || []))
  if (ya) {
    const ids = new Set([...(ya.ids || []), ...(entrada.ids || [])])
    ya.ids = [...ids]
    if (entrada.name) ya.name = entrada.name
    guardar(conn, lista)
    return { ok: true, ya: true, entrada: ya }
  }
  const nueva = {
    name: entrada.name || 'contacto',
    ids: [...new Set((entrada.ids || []).filter(Boolean))],
    at: Date.now(),
    by: entrada.by || ''
  }
  lista.push(nueva)
  guardar(conn, lista)
  return { ok: true, ya: false, entrada: nueva }
}

export function quitarBlackn(conn, ids = []) {
  const lista = leer(conn)
  const antes = lista.length
  const siguiente = lista.filter(item => !jidsSeSolapan(item?.ids || [], ids))
  if (siguiente.length === antes) return { ok: false }
  guardar(conn, siguiente)
  return { ok: true, quitados: antes - siguiente.length }
}
