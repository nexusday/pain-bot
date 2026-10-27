import { datosReaccion } from './reacciones.js'

const TIPOS = new Set(['kill', 'kiss', 'pat'])

export function urlReaccionDelirius(tipo, api = global.APIs?.delirius) {
  if (!TIPOS.has(tipo)) throw new Error('Reacción no admitida.')
  if (typeof api?.url !== 'string' || !api.url.trim()) throw new Error('Falta configurar la API global.')
  const url = new URL(`${api.url.trim().replace(/\/+$/, '')}/reactions/${tipo}`)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('La URL global no es válida.')
  if (api.key) url.searchParams.set('apikey', String(api.key))
  return url.toString()
}

export function videoReaccionDelirius(respuesta) {
  if (respuesta?.status !== true || typeof respuesta.data?.url !== 'string') throw new Error('no devolvió una reacción válida.')
  const url = new URL(respuesta.data.url)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !/\.mp4$/i.test(url.pathname)) {
    throw new Error('no devolvió un vídeo MP4 válido.')
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
  if (!respuesta.ok) throw new Error(`Delirius respondió HTTP ${respuesta.status}.`)
  return videoReaccionDelirius(await respuesta.json())
}

export function crearReaccionDelirius({ tipo, comandos, texto }, { obtenerVideo = obtenerReaccionDelirius } = {}) {
  const handler = async (m, { conn, participants = [], usedPrefix = '/', command = comandos[0] }) => {
    const datos = datosReaccion(m, conn, participants)
    if (!datos.objetivo) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Menciona a un usuario o responde a su mensaje.\n\n> ${usedPrefix}${command} @usuario\n> (responde un mensaje) ${usedPrefix}${command}`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }
    try {
      const url = await obtenerVideo(tipo)
      return await conn.sendMessage(m.chat, {
        video: { url }, mimetype: 'video/mp4', gifPlayback: true,
        caption: texto(datos.etiquetaUsuario, datos.targetTag),
        contextInfo: { mentionedJid: datos.mencion },
      }, { quoted: m })
    } catch {
      // Los errores de red pueden incluir URLs con la API key: no publicarlos.
      console.error(`[reaccion-${tipo}] No se pudo obtener o enviar el vídeo.`)
      return conn.sendMessage(m.chat, {
        text: '[❗] No se pudo cargar la reacción. Inténtalo de nuevo en unos segundos.',
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }
  }
  handler.help = [`${comandos.join(' / ')} @user / responder`]
  handler.tags = ['reaccion']
  handler.command = comandos
  return handler
}
