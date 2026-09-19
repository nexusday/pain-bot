import chalk from 'chalk'
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

function esAudioMedia(media) {
  return media?.type === 'audio' && media?.mediaMsg
}

async function resolverPayloadAudioVerUnaVez(m, citado, citadoCompleto, almacenado) {
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
      ptt: media?.mediaMsg?.ptt ?? null,
      knownViewOnceId: isKnownViewOnce(m.quoted?.id)
    })

    if (esVO && esAudioMedia(media)) {
      return {
        ...media,
        source: label,
        quoted: citado,
        fullQuoted: citadoCompleto,
        attempts: intentos
      }
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
      ptt: media?.mediaMsg?.ptt ?? null,
      knownViewOnceId: isKnownViewOnce(m.quoted?.id)
    })

    if (esVO && esAudioMedia(media)) {
      return {
        ...media,
        source: 'getQuotedObj().message',
        quoted: citadoCompleto,
        fullQuoted: citadoCompleto,
        attempts: intentos
      }
    }
  }

  return { attempts: intentos }
}

function registrarDebugSsa(etapa, data) {
  console.log(chalk.cyan(`\n[ssa] === ${etapa} ===`))
  console.log(chalk.gray(JSON.stringify(data, null, 2)))
}

async function descargarAudioVerUnaVez(conn, payload) {
  const destinoDescarga = prepararMsgMedia(payload.mediaMsg)
  const citado = payload.fullQuoted || payload.quoted

  try {
    if (citado?.download) {
      const bufer = await citado.download()
      if (bufer?.length) return bufer
    }
  } catch (error) {
    registrarDebugSsa('download quoted error', { error: error.message })
  }

  if (conn.downloadM) {
    try {
      const bufer = await conn.downloadM(destinoDescarga, 'audio')
      if (bufer?.length) return bufer
    } catch (error) {
      registrarDebugSsa('downloadM audio error', { error: error.message })
    }
    try {
      const bufer = await conn.downloadM(destinoDescarga, 'audioMessage')
      if (bufer?.length) return bufer
    } catch (error) {
      registrarDebugSsa('downloadM audioMessage error', { error: error.message })
    }
  }

  throw new Error('No se pudo descargar el audio')
}

function mimeAudio(mediaMsg) {
  const mime = String(mediaMsg?.mimetype || '').trim()
  if (mime) return mime
  return mediaMsg?.ptt ? 'audio/ogg; codecs=opus' : 'audio/mpeg'
}

let handler = async (m, { conn, usedPrefix, command }) => {
  try {
    if (!m.quoted) {
      return conn.reply(
        m.chat,
        `*[❗] Responde a un audio / nota de voz de una sola vez con ${usedPrefix + command}.*`,
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

    const audioCrudo = m?.msg?.contextInfo?.quotedMessage?.audioMessage
    const audioAlmacenado = almacenado?.message?.audioMessage

    registrarDebugSsa('INICIO', {
      quotedId: m.quoted?.id,
      quotedMtype: m.quoted?.mtype,
      quotedMediaType: m.quoted?.mediaType,
      rawQuotedKeys: getMessageKeys(m?.msg?.contextInfo?.quotedMessage),
      rawViewOnce: audioCrudo?.viewOnce ?? null,
      rawPtt: audioCrudo?.ptt ?? null,
      storedKeys: getMessageKeys(almacenado?.message),
      storedViewOnce: audioAlmacenado?.viewOnce ?? null,
      storedKeyIsViewOnce: almacenado?.key?.isViewOnce ?? null,
      knownViewOnceId: isKnownViewOnce(m.quoted?.id),
      storedFound: !!almacenado,
      storedScore: scoreStoredMessage(almacenado),
      fullQuotedMtype: citadoCompleto?.mtype,
      fullQuotedKeys: getMessageKeys(citadoCompleto?.message)
    })

    const resultado = await resolverPayloadAudioVerUnaVez(m, m.quoted, citadoCompleto, almacenado)

    registrarDebugSsa('RESOLUCION', {
      attempts: resultado.attempts,
      found: !!(resultado.mediaMsg && resultado.type === 'audio'),
      source: resultado.source || null,
      type: resultado.type || null
    })

    if (!resultado.mediaMsg || resultado.type !== 'audio') {
      return conn.reply(
        m.chat,
        `*[❗] No se detectó audio de una sola vez.*\n> Respondé al audio/nota de voz.`,
        m,
        rcanal
      )
    }

    const bufer = await descargarAudioVerUnaVez(conn, resultado)
    if (!bufer?.length) throw new Error('Audio vacío')

    registrarDebugSsa('DESCARGA OK', {
      bytes: bufer.length,
      source: resultado.source,
      ptt: !!resultado.mediaMsg.ptt,
      mimetype: resultado.mediaMsg.mimetype || null
    })

    const esPtt = resultado.mediaMsg.ptt === true
    await conn.sendMessage(
      m.chat,
      {
        audio: bufer,
        mimetype: mimeAudio(resultado.mediaMsg),
        ptt: esPtt,
        contextInfo: rcanal?.contextInfo
      },
      { quoted: m }
    )
  } catch (error) {
    console.error(chalk.red('[ssa] Error:'), error)
    conn.reply(
      m.chat,
      `*[❌] Error al procesar audio view once: ${error.message || 'desconocido'}*`,
      m,
      rcanal
    )
  }
}

handler.help = ['#ssa + {responder audio/nota de voz una vez} → guarda el audio']
handler.tags = ['audio', 'tools']
handler.command = ['ssa', 'ssaudio', 'saveaudio']

export default handler
