import { datosReaccion } from './reacciones.js'

// Delirius publica más acciones, pero `glomp` devuelve un error 404 interno.
export const TIPOS_REACCION_DELIRIUS = Object.freeze([
  'angry',
  'bite',
  'blush',
  'bonk',
  'bully',
  'confy',
  'cringe',
  'cry',
  'cuddle',
  'dance',
  'eevee',
  'fluff',
  'handhold',
  'happy',
  'highfive',
  'hug',
  'kick',
  'kill',
  'kiss',
  'lay',
  'lick',
  'nom',
  'pat',
  'poke',
  'pout',
  'slap',
  'smile',
  'smug',
  'tail',
  'tickle',
  'wink',
  'yeet',
])

const TIPOS = new Set(TIPOS_REACCION_DELIRIUS)

export function urlReaccionDelirius(tipo, api = global.APIs?.delirius) {
  if (!TIPOS.has(tipo)) throw new Error('Reacción no admitida.')
  if (typeof api?.url !== 'string' || !api.url.trim()) throw new Error('Falta configurar la API de reacciones.')
  const url = new URL(`${api.url.trim().replace(/\/+$/, '')}/reactions/${tipo}`)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('La URL de la API de reacciones no es válida.')
  if (api.key) url.searchParams.set('apikey', String(api.key))
  return url.toString()
}

export function videoReaccionDelirius(respuesta) {
  if (respuesta?.status !== true || typeof respuesta.data?.url !== 'string') throw new Error('La API no devolvió una reacción válida.')
  const url = new URL(respuesta.data.url)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !/\.mp4$/i.test(url.pathname)) {
    throw new Error('La API no devolvió un vídeo MP4 válido.')
  }
  // La API devuelve HTTP, pero su CDN sirve los mismos archivos por HTTPS.
  if (url.hostname === 'cdn.delirius.online') url.protocol = 'https:'
  return url.toString()
}

export async function obtenerReaccionDelirius(tipo, { api = global.APIs?.delirius, fetchFn = globalThis.fetch } = {}) {
  const respuesta = await fetchFn(urlReaccionDelirius(tipo, api), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!respuesta.ok) throw new Error(`La API respondió HTTP ${respuesta.status}.`)
  return videoReaccionDelirius(await respuesta.json())
}

function validarDefinicion(definicion, comandosVistos = null) {
  if (!definicion || !TIPOS.has(definicion.tipo)) throw new Error('Definición de reacción no válida.')
  if (!Array.isArray(definicion.comandos) || !definicion.comandos.length) throw new Error(`La reacción ${definicion.tipo} no tiene comandos.`)
  if (typeof definicion.texto !== 'function') throw new Error(`La reacción ${definicion.tipo} no tiene texto.`)
  for (const comando of definicion.comandos) {
    if (typeof comando !== 'string' || !comando.trim()) throw new Error(`La reacción ${definicion.tipo} tiene un comando vacío.`)
    const clave = comando.trim().toLowerCase()
    if (comandosVistos?.has(clave)) throw new Error(`Comando de reacción duplicado: ${clave}.`)
    comandosVistos?.add(clave)
  }
}

function explicarUso(conn, m, usedPrefix, command, opcional) {
  const sufijo = opcional ? ' [@usuario]' : ' @usuario'
  return conn.sendMessage(m.chat, {
    text: `[❗] Menciona a un usuario o responde a su mensaje.\n\n> ${usedPrefix}${command}${sufijo}\n> (responde un mensaje) ${usedPrefix}${command}`,
    contextInfo: { ...(global.rcanal?.contextInfo || {}) },
  }, { quoted: m })
}

async function enviarReaccion({ m, conn, datos, definicion, command, usedPrefix, obtenerVideo }) {
  if (!datos.objetivo && !definicion.opcional) {
    return explicarUso(conn, m, usedPrefix, command, false)
  }

  try {
    const url = await obtenerVideo(definicion.tipo)
    return await conn.sendMessage(m.chat, {
      video: { url },
      mimetype: 'video/mp4',
      gifPlayback: true,
      caption: definicion.texto(datos.etiquetaUsuario, datos.targetTag, datos.objetivo),
      contextInfo: { mentionedJid: datos.mencion },
    }, { quoted: m })
  } catch {
    // Los errores de red pueden incluir URLs con la API key: no publicarlos.
    console.error(`[reaccion-${definicion.tipo}] No se pudo obtener o enviar el vídeo.`)
    return conn.sendMessage(m.chat, {
      text: '[❗] No se pudo cargar la reacción. Inténtalo de nuevo en unos segundos.',
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  }
}

export function crearReaccionDelirius({ tipo, comandos, texto, opcional = false }, { obtenerVideo = obtenerReaccionDelirius } = {}) {
  const definicion = { tipo, comandos, texto, opcional }
  validarDefinicion(definicion)
  const handler = async (m, { conn, participants = [], usedPrefix = '/', command = comandos[0] }) => {
    const datos = datosReaccion(m, conn, participants)
    return enviarReaccion({ m, conn, datos, definicion, command, usedPrefix, obtenerVideo })
  }
  handler.help = [`${comandos.join(' / ')}${opcional ? ' [@user]' : ' @user'} / responder`]
  handler.tags = ['reaccion']
  handler.command = comandos
  handler.opcional = opcional
  handler.tipoReaccion = tipo
  return handler
}

export function crearReaccionesDelirius(definiciones, { obtenerVideo = obtenerReaccionDelirius } = {}) {
  if (!Array.isArray(definiciones) || !definiciones.length) throw new Error('No hay reacciones para registrar.')
  const comandosVistos = new Set()
  const porComando = new Map()
  const definicionesValidadas = []
  for (const definicion of definiciones) {
    validarDefinicion(definicion, comandosVistos)
    definicionesValidadas.push(definicion)
    for (const comando of definicion.comandos) porComando.set(comando.trim().toLowerCase(), definicion)
  }

  const handler = async (m, { conn, participants = [], usedPrefix = '/', command }) => {
    const definicion = porComando.get(String(command || '').trim().toLowerCase())
    if (!definicion) return
    const datos = datosReaccion(m, conn, participants)
    return enviarReaccion({ m, conn, datos, definicion, command, usedPrefix, obtenerVideo })
  }
  handler.help = definicionesValidadas.map(definicion => {
    const sufijo = definicion.opcional ? ' [@user]' : ' @user'
    return `${definicion.comandos.join(' / ')}${sufijo} / responder`
  })
  handler.tags = ['reaccion']
  handler.command = [...porComando.keys()]
  handler.tiposReaccion = Object.freeze(definicionesValidadas.map(definicion => definicion.tipo))
  return handler
}
