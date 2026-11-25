/**
 * Caché de fotos de perfil para las citas verificadas.
 *
 * Antes, cada `sendMessage` con `{ quoted: m }` consultaba el perfil del
 * contacto a WhatsApp y descargaba la imagen por HTTP antes de enviar. Con 300
 * sub-bots eso son cientos de consultas por minuto compitiendo con los
 * mensajes: la respuesta tardaba segundos y WhatsApp acababa limitando el
 * socket (408/429).
 *
 * Aquí la foto se sirve SIEMPRE desde memoria. Si no está, se encola una
 * descarga en segundo plano con un pequeño token-bucket global y la cita sale
 * sin foto (o con la anterior cacheada). El resultado se reutiliza 24 h.
 */
import fetch from 'node-fetch'

const TTL_MS = Math.max(
  60_000,
  Number.parseInt(process.env.PAIN_AVATAR_TTL_MS, 10) || 24 * 60 * 60 * 1000
)
const NEGATIVE_TTL_MS = Math.max(
  60_000,
  Number.parseInt(process.env.PAIN_AVATAR_NEGATIVE_TTL_MS, 10) || 60 * 60 * 1000
)
const MAX_ENTRIES = Math.max(
  50,
  Number.parseInt(process.env.PAIN_AVATAR_MAX_ENTRIES, 10) || 600
)
const MAX_BYTES_TOTAL = Math.max(
  1024 * 1024,
  Number.parseInt(process.env.PAIN_AVATAR_MAX_MB, 10) * 1024 * 1024 || 24 * 1024 * 1024
)
const MAX_BYTES_IMAGEN = Math.max(
  32 * 1024,
  Number.parseInt(process.env.PAIN_AVATAR_MAX_IMAGE_KB, 10) * 1024 || 200 * 1024
)
const MAX_EN_VUELO = Math.min(
  Math.max(Number.parseInt(process.env.PAIN_AVATAR_CONCURRENCY, 10) || 3, 1),
  8
)
const MAX_COLA = Math.max(
  50,
  Number.parseInt(process.env.PAIN_AVATAR_QUEUE, 10) || 500
)
const ESPACIO_MS = Math.min(
  Math.max(Number.parseInt(process.env.PAIN_AVATAR_GAP_MS, 10) || 400, 0),
  5_000
)

const cache = new Map() // jid -> { buffer|null, at }
const enVuelo = new Set()
const cola = []
let bytesTotales = 0
let activos = 0
let ultimoInicio = 0
let temporizadorCola = null

function jidValido(jid = '') {
  const s = String(jid || '')
  if (!s || s === '0@s.whatsapp.net') return false
  if (s.endsWith('@g.us')) return false
  if (s.endsWith('@newsletter')) return false
  if (s === 'status@broadcast') return false
  return s.includes('@')
}

function edadEntrada(entrada, ahora) {
  const ttl = entrada.buffer ? TTL_MS : NEGATIVE_TTL_MS
  return ahora - (Number(entrada.at) || 0) > ttl
}

function eliminarEntrada(jid) {
  const entrada = cache.get(jid)
  if (!entrada) return
  if (entrada.buffer?.length) bytesTotales -= entrada.buffer.length
  cache.delete(jid)
}

function podar() {
  const ahora = Date.now()
  for (const [jid, entrada] of cache) {
    if (edadEntrada(entrada, ahora)) eliminarEntrada(jid)
  }
  while (cache.size > MAX_ENTRIES) {
    const masAntiguo = cache.keys().next().value
    if (masAntiguo === undefined) break
    eliminarEntrada(masAntiguo)
  }
  while (bytesTotales > MAX_BYTES_TOTAL) {
    let candidato = null
    for (const [jid, entrada] of cache) {
      if (!entrada?.buffer?.length) continue
      if (!candidato || entrada.at < candidato.at) candidato = { jid, at: entrada.at }
    }
    if (!candidato) break
    eliminarEntrada(candidato.jid)
  }
}

/** Foto ya cacheada (Buffer) o null. Nunca hace red. */
export function obtenerAvatarCacheado(jid) {
  if (!jidValido(jid)) return null
  const entrada = cache.get(String(jid))
  if (!entrada) return null
  if (edadEntrada(entrada, Date.now())) {
    eliminarEntrada(String(jid))
    return null
  }
  return entrada.buffer || null
}

function despachar() {
  if (activos >= MAX_EN_VUELO || !cola.length) return
  const espera = ESPACIO_MS
    ? Math.max(0, ultimoInicio + ESPACIO_MS - Date.now())
    : 0
  if (espera > 0) {
    if (!temporizadorCola) {
      temporizadorCola = setTimeout(() => {
        temporizadorCola = null
        despachar()
      }, espera)
      temporizadorCola.unref?.()
    }
    return
  }
  const trabajo = cola.shift()
  if (!trabajo) return
  activos++
  ultimoInicio = Date.now()
  Promise.resolve()
    .then(trabajo)
    .catch(() => {})
    .finally(() => {
      activos = Math.max(0, activos - 1)
      despachar()
    })
}

async function descargarAvatar(conn, jid) {
  let url = null
  try {
    url = await conn.profilePictureUrl(jid, 'image')
  } catch {
    url = null
  }
  let buffer = null
  if (url) {
    try {
      const respuesta = await fetch(url, { signal: AbortSignal.timeout?.(8000) })
      if (respuesta?.ok) {
        const datos = Buffer.from(await respuesta.arrayBuffer())
        if (datos.length && datos.length <= MAX_BYTES_IMAGEN) buffer = datos
      }
    } catch {
      buffer = null
    }
  }
  const ahora = Date.now()
  eliminarEntrada(jid)
  cache.set(jid, { buffer, at: ahora })
  if (buffer?.length) bytesTotales += buffer.length
  podar()
}

/**
 * Encola la descarga de la foto si no está en caché. No bloquea nunca.
 * Devuelve true si ya estaba disponible.
 */
export function precargarAvatar(conn, jid) {
  const id = String(jid || '')
  if (!jidValido(id) || !conn || typeof conn.profilePictureUrl !== 'function') return false
  const entrada = cache.get(id)
  if (entrada && !edadEntrada(entrada, Date.now())) return Boolean(entrada.buffer)
  if (enVuelo.has(id)) return false
  if (cola.length >= MAX_COLA) return false

  enVuelo.add(id)
  cola.push(async () => {
    try {
      await descargarAvatar(conn, id)
    } finally {
      enVuelo.delete(id)
    }
  })
  despachar()
  return false
}

export function estadisticasAvatarCache() {
  return { entradas: cache.size, bytes: bytesTotales, enVuelo: enVuelo.size, cola: cola.length }
}

export function limpiarAvatarCache() {
  cache.clear()
  enVuelo.clear()
  cola.length = 0
  bytesTotales = 0
}
