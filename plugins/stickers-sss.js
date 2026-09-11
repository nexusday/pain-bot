import chalk from 'chalk'
import { webp2png } from '../lib/webp2mp4.js'
import { toWebp } from './stickers-sticker.js'
import {
  detectViewOnce,
  extractMediaContent,
  getCachedViewOnceRaw,
  getMessageKeys,
  isKnownViewOnce,
  scoreStoredMessage
} from '../lib/viewOnce.js'

function prepararMsgMedia(mediaMsg) {
  if (!mediaMsg) return mediaMsg
  const copia = JSON.parse(JSON.stringify(mediaMsg))
  delete copia.viewOnce
  return copia
}

function cargarCitadoDesdeStore(conn, m) {
  const idEstrofa = m.quoted?.id || m.msg?.contextInfo?.stanzaId
  if (!idEstrofa) return null

  const jidRemoto = m.msg?.contextInfo?.remoteJid || m.quoted?.chat || m.chat
  const participante = m.msg?.contextInfo?.participant

  const candidatos = []
  const vistos = new Set()

  const agregar = (entrada) => {
    if (!entrada?.message || vistos.has(entrada)) return
    vistos.add(entrada)
    candidatos.push(entrada)
  }

  agregar(getCachedViewOnceRaw(idEstrofa))
  if (conn?.chats) {
    agregar(conn.chats[jidRemoto]?.messages?.[idEstrofa])
    agregar(conn.chats[m.chat]?.messages?.[idEstrofa])
    if (participante) agregar(conn.chats[participante]?.messages?.[idEstrofa])

    for (const chat of Object.values(conn.chats)) {
      agregar(chat?.messages?.[idEstrofa])
    }
  }

  candidatos.sort((a, b) => scoreStoredMessage(b) - scoreStoredMessage(a))
  return candidatos[0] || null
}

function recolectarFuentesCitadas(m, citado, almacenado) {
  const fuentes = []
  const citadoCrudo = m?.msg?.contextInfo?.quotedMessage
  if (citadoCrudo) fuentes.push({ label: 'contextInfo.quotedMessage', raw: citadoCrudo })
  if (almacenado?.message) fuentes.push({ label: 'store.cachedMessage', raw: almacenado.message })
  if (citado?.vM?.message) fuentes.push({ label: 'quoted.vM.message', raw: citado.vM.message })
  return fuentes
}

async function resolverPayloadVerUnaVez(m, citado, citadoCompleto, almacenado) {
  const intentos = []

  for (const { label, raw } of recolectarFuentesCitadas(m, citado, almacenado)) {
    const media = extractMediaContent(raw)
    const esVO = detectViewOnce(raw, media?.mediaMsg, almacenado, m.quoted?.id)
    intentos.push({
      label,
      keys: getMessageKeys(raw),
      isViewOnce: esVO,
      mediaType: media?.type || null,
      viewOnceFlag: media?.mediaMsg?.viewOnce ?? null,
      knownViewOnceId: isKnownViewOnce(m.quoted?.id)
    })

    if (esVO && media) {
      return { ...media, source: etiqueta, quoted, fullQuoted, attempts }
    }
  }

  if (citadoCompleto?.message) {
    const raw = citadoCompleto.message
    const media = extractMediaContent(raw)
    const esVO = detectViewOnce(raw, media?.mediaMsg, almacenado, m.quoted?.id)
    intentos.push({
      label: 'getQuotedObj().message',
      keys: getMessageKeys(raw),
      isViewOnce: esVO,
      mediaType: media?.type || null,
      mtype: citadoCompleto.mtype,
      viewOnceFlag: media?.mediaMsg?.viewOnce ?? null,
      knownViewOnceId: isKnownViewOnce(m.quoted?.id)
    })

    if (esVO && media) {
      return { ...media, source: 'getQuotedObj().message', quoted: citadoCompleto, fullQuoted, attempts }
    }
  }

  return { attempts }
}

function registrarDebugSss(etapa, data) {
  console.log(chalk.cyan(`\n[sss] === ${etapa} ===`))
  console.log(chalk.gray(JSON.stringify(data, null, 2)))
}

async function descargarMediaVerUnaVez(conn, payload) {
  const destinoDescarga = prepararMsgMedia(payload.mediaMsg)
  const citado = payload.fullQuoted || payload.quoted

  try {
    if (citado?.download) {
      const bufer = await citado.download()
      if (bufer?.length) return bufer
    }
  } catch (error) {
    registrarDebugSss('download quoted error', { error: error.message })
  }

  if (conn.downloadM) {
    return conn.downloadM(destinoDescarga, payload.type)
  }

  throw new Error('No hay método de descarga disponible')
}

function construirDatosMencion(rawMsg, conn) {
  const leyenda = (rawMsg?.caption || '').trim()
  let jidsMencionados = rawMsg?.contextInfo?.mentionedJid || []

  jidsMencionados = jidsMencionados
    .map((jid) => {
      if (!jid) return ''
      if (typeof jid === 'object') return jid.jid || jid.lid || jid.id || ''
      return String(jid)
    })
    .filter(Boolean)

  if (!jidsMencionados.length && leyenda) {
    jidsMencionados = conn.parseMention(leyenda)
  }

  return { caption: leyenda, mentionedJid: jidsMencionados }
}

function esOwner(m, conn) {
  const sender = m.sender
  return global.owner?.some(([n]) => sender?.includes(n.replace(/\D/g, '')))
    || global.ownerLid?.some(([n]) => sender?.includes(n))
    || sender === conn.user?.jid
}

let handler = async (m, { conn, usedPrefix, command }) => {
  try {
    if (!m.quoted) {
      return conn.reply(
        m.chat,
        `*[❗] Responde a una foto o video de *ver una vez* con ${usedPrefix + command}.*`,
        m,
        rcanal
      )
    }

    let citadoCompleto = null
    try {
      citadoCompleto = m.getQuotedObj?.() ?? null
    } catch {
      citadoCompleto = null
    }
    const almacenado = cargarCitadoDesdeStore(conn, m)

    const imgCruda = m?.msg?.contextInfo?.quotedMessage?.imageMessage
    const vidCrudo = m?.msg?.contextInfo?.quotedMessage?.videoMessage
    const imgAlmacenada = almacenado?.message?.imageMessage
    const vidAlmacenado = almacenado?.message?.videoMessage

    registrarDebugSss('INICIO', {
      quotedId: m.quoted?.id,
      quotedMtype: m.quoted?.mtype,
      quotedMediaType: m.quoted?.mediaType,
      quotedType: m?.msg?.contextInfo?.quotedType ?? null,
      rawQuotedKeys: getMessageKeys(m?.msg?.contextInfo?.quotedMessage),
      rawViewOnce: imgCruda?.viewOnce ?? vidCrudo?.viewOnce ?? null,
      storedKeys: getMessageKeys(almacenado?.message),
      storedViewOnce: imgAlmacenada?.viewOnce ?? vidAlmacenado?.viewOnce ?? null,
      storedKeyIsViewOnce: almacenado?.key?.isViewOnce ?? null,
      knownViewOnceId: isKnownViewOnce(m.quoted?.id),
      storedFound: !!almacenado,
      storedScore: scoreStoredMessage(almacenado),
      fullQuotedMtype: citadoCompleto?.mtype,
      fullQuotedKeys: getMessageKeys(citadoCompleto?.message),
      contextInfoKeys: m?.msg?.contextInfo ? Object.keys(m.msg.contextInfo) : []
    })

    const resultado = await resolverPayloadVerUnaVez(m, m.quoted, citadoCompleto, almacenado)

    registrarDebugSss('RESOLUCION', {
      attempts: resultado.attempts,
      found: !!(resultado.mediaMsg && resultado.type),
      source: resultado.source || null,
      type: resultado.type || null
    })

    if (!resultado.mediaMsg || !resultado.type) {
      const textoDebug = esOwner(m, conn)
        ? `\n\n*[debug owner]*\n` +
          `quoted.mtype: ${m.quoted?.mtype}\n` +
          `keys raw: ${getMessageKeys(m?.msg?.contextInfo?.quotedMessage).join(', ') || 'ninguna'}\n` +
          `keys store: ${getMessageKeys(almacenado?.message).join(', ') || 'ninguna'}\n` +
          `getQuotedObj.mtype: ${citadoCompleto?.mtype || 'null'}\n` +
          `intentos: ${JSON.stringify(resultado.attempts, null, 2).slice(0, 1500)}`
        : ''

      return conn.reply(
        m.chat,
        `*[❗] No se detectó foto/video de *ver una vez*.\n> Respondé al mensaje.`,
        m,
        rcanal
      )
    }

    const bufer = await descargarMediaVerUnaVez(conn, resultado)
    if (!bufer?.length) throw new Error('No se pudo descargar el media')

    registrarDebugSss('DESCARGA OK', { bytes: bufer.length, type: resultado.type, source: resultado.source })

    const { caption: leyenda, mentionedJid: jidsMencionados } = construirDatosMencion(resultado.mediaMsg, conn)
    const contextInfo = {
      ...rcanal.contextInfo,
      ...(jidsMencionados.length ? { mentionedJid: jidsMencionados } : {})
    }
    const extra = {
      ...(leyenda ? { caption: leyenda } : {}),
      ...(jidsMencionados.length ? { mentions: jidsMencionados } : {}),
      contextInfo
    }

    if (resultado.type === 'video') {
      await conn.sendMessage(m.chat, {
        video: bufer,
        mimetype: resultado.mediaMsg.mimetype || 'video/mp4',
        ...extra
      }, { quoted: m })
      return
    }

    const buferSticker = await toWebp(bufer)
    const urlImagen = await webp2png(buferSticker)
    if (!urlImagen) throw new Error('No se pudo convertir a imagen')

    await conn.sendMessage(m.chat, {
      image: { url: urlImagen },
      ...extra
    }, { quoted: m })
  } catch (error) {
    console.error(chalk.red('[sss] Error:'), error)
    conn.reply(
      m.chat,
      `*[❌] Error al procesar view once: ${error.message || 'desconocido'}*`,
      m,
      rcanal
    )
  }
}

handler.help = ['#sss + {responder foto/video ver una vez} → guarda el contenido']
handler.tags = ['stickers']
handler.command = ['sss']

export default handler
