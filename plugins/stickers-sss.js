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

function prepareMediaMsg(mediaMsg) {
  if (!mediaMsg) return mediaMsg
  const copy = JSON.parse(JSON.stringify(mediaMsg))
  delete copy.viewOnce
  return copy
}

function loadQuotedFromStore(conn, m) {
  const stanzaId = m.quoted?.id || m.msg?.contextInfo?.stanzaId
  if (!stanzaId) return null

  const remoteJid = m.msg?.contextInfo?.remoteJid || m.quoted?.chat || m.chat
  const participant = m.msg?.contextInfo?.participant

  const candidates = []
  const seen = new Set()

  const push = (entry) => {
    if (!entry?.message || seen.has(entry)) return
    seen.add(entry)
    candidates.push(entry)
  }

  push(getCachedViewOnceRaw(stanzaId))
  if (conn?.chats) {
    push(conn.chats[remoteJid]?.messages?.[stanzaId])
    push(conn.chats[m.chat]?.messages?.[stanzaId])
    if (participant) push(conn.chats[participant]?.messages?.[stanzaId])

    for (const chat of Object.values(conn.chats)) {
      push(chat?.messages?.[stanzaId])
    }
  }

  candidates.sort((a, b) => scoreStoredMessage(b) - scoreStoredMessage(a))
  return candidates[0] || null
}

function collectQuotedSources(m, quoted, stored) {
  const sources = []
  const rawQuoted = m?.msg?.contextInfo?.quotedMessage
  if (rawQuoted) sources.push({ label: 'contextInfo.quotedMessage', raw: rawQuoted })
  if (stored?.message) sources.push({ label: 'store.cachedMessage', raw: stored.message })
  if (quoted?.vM?.message) sources.push({ label: 'quoted.vM.message', raw: quoted.vM.message })
  return sources
}

async function resolveViewOncePayload(m, quoted, fullQuoted, stored) {
  const attempts = []

  for (const { label, raw } of collectQuotedSources(m, quoted, stored)) {
    const media = extractMediaContent(raw)
    const isVO = detectViewOnce(raw, media?.mediaMsg, stored, m.quoted?.id)
    attempts.push({
      label,
      keys: getMessageKeys(raw),
      isViewOnce: isVO,
      mediaType: media?.type || null,
      viewOnceFlag: media?.mediaMsg?.viewOnce ?? null,
      knownViewOnceId: isKnownViewOnce(m.quoted?.id)
    })

    if (isVO && media) {
      return { ...media, source: label, quoted, fullQuoted, attempts }
    }
  }

  if (fullQuoted?.message) {
    const raw = fullQuoted.message
    const media = extractMediaContent(raw)
    const isVO = detectViewOnce(raw, media?.mediaMsg, stored, m.quoted?.id)
    attempts.push({
      label: 'getQuotedObj().message',
      keys: getMessageKeys(raw),
      isViewOnce: isVO,
      mediaType: media?.type || null,
      mtype: fullQuoted.mtype,
      viewOnceFlag: media?.mediaMsg?.viewOnce ?? null,
      knownViewOnceId: isKnownViewOnce(m.quoted?.id)
    })

    if (isVO && media) {
      return { ...media, source: 'getQuotedObj().message', quoted: fullQuoted, fullQuoted, attempts }
    }
  }

  return { attempts }
}

function logSssDebug(stage, data) {
  console.log(chalk.cyan(`\n[sss] === ${stage} ===`))
  console.log(chalk.gray(JSON.stringify(data, null, 2)))
}

async function downloadViewOnceMedia(conn, payload) {
  const downloadTarget = prepareMediaMsg(payload.mediaMsg)
  const quoted = payload.fullQuoted || payload.quoted

  try {
    if (quoted?.download) {
      const buf = await quoted.download()
      if (buf?.length) return buf
    }
  } catch (e) {
    logSssDebug('download quoted error', { error: e.message })
  }

  if (conn.downloadM) {
    return conn.downloadM(downloadTarget, payload.type)
  }

  throw new Error('No hay método de descarga disponible')
}

function buildMentionData(rawMsg, conn) {
  const caption = (rawMsg?.caption || '').trim()
  let mentionedJid = rawMsg?.contextInfo?.mentionedJid || []

  mentionedJid = mentionedJid
    .map((jid) => {
      if (!jid) return ''
      if (typeof jid === 'object') return jid.jid || jid.lid || jid.id || ''
      return String(jid)
    })
    .filter(Boolean)

  if (!mentionedJid.length && caption) {
    mentionedJid = conn.parseMention(caption)
  }

  return { caption, mentionedJid }
}

function isOwner(m, conn) {
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

    let fullQuoted = null
    try {
      fullQuoted = m.getQuotedObj?.() ?? null
    } catch {
      fullQuoted = null
    }
    const stored = loadQuotedFromStore(conn, m)

    const rawImg = m?.msg?.contextInfo?.quotedMessage?.imageMessage
    const rawVid = m?.msg?.contextInfo?.quotedMessage?.videoMessage
    const storedImg = stored?.message?.imageMessage
    const storedVid = stored?.message?.videoMessage

    logSssDebug('INICIO', {
      quotedId: m.quoted?.id,
      quotedMtype: m.quoted?.mtype,
      quotedMediaType: m.quoted?.mediaType,
      quotedType: m?.msg?.contextInfo?.quotedType ?? null,
      rawQuotedKeys: getMessageKeys(m?.msg?.contextInfo?.quotedMessage),
      rawViewOnce: rawImg?.viewOnce ?? rawVid?.viewOnce ?? null,
      storedKeys: getMessageKeys(stored?.message),
      storedViewOnce: storedImg?.viewOnce ?? storedVid?.viewOnce ?? null,
      storedKeyIsViewOnce: stored?.key?.isViewOnce ?? null,
      knownViewOnceId: isKnownViewOnce(m.quoted?.id),
      storedFound: !!stored,
      storedScore: scoreStoredMessage(stored),
      fullQuotedMtype: fullQuoted?.mtype,
      fullQuotedKeys: getMessageKeys(fullQuoted?.message),
      contextInfoKeys: m?.msg?.contextInfo ? Object.keys(m.msg.contextInfo) : []
    })

    const result = await resolveViewOncePayload(m, m.quoted, fullQuoted, stored)

    logSssDebug('RESOLUCION', {
      attempts: result.attempts,
      found: !!(result.mediaMsg && result.type),
      source: result.source || null,
      type: result.type || null
    })

    if (!result.mediaMsg || !result.type) {
      const debugText = isOwner(m, conn)
        ? `\n\n*[debug owner]*\n` +
          `quoted.mtype: ${m.quoted?.mtype}\n` +
          `keys raw: ${getMessageKeys(m?.msg?.contextInfo?.quotedMessage).join(', ') || 'ninguna'}\n` +
          `keys store: ${getMessageKeys(stored?.message).join(', ') || 'ninguna'}\n` +
          `getQuotedObj.mtype: ${fullQuoted?.mtype || 'null'}\n` +
          `intentos: ${JSON.stringify(result.attempts, null, 2).slice(0, 1500)}`
        : ''

      return conn.reply(
        m.chat,
        `*[❗] No se detectó foto/video de *ver una vez*.\n> Respondé al mensaje.`,
        m,
        rcanal
      )
    }

    const buffer = await downloadViewOnceMedia(conn, result)
    if (!buffer?.length) throw new Error('No se pudo descargar el media')

    logSssDebug('DESCARGA OK', { bytes: buffer.length, type: result.type, source: result.source })

    const { caption, mentionedJid } = buildMentionData(result.mediaMsg, conn)
    const contextInfo = {
      ...rcanal.contextInfo,
      ...(mentionedJid.length ? { mentionedJid } : {})
    }
    const extra = {
      ...(caption ? { caption } : {}),
      ...(mentionedJid.length ? { mentions: mentionedJid } : {}),
      contextInfo
    }

    if (result.type === 'video') {
      await conn.sendMessage(m.chat, {
        video: buffer,
        mimetype: result.mediaMsg.mimetype || 'video/mp4',
        ...extra
      }, { quoted: m })
      return
    }

    const stickerBuffer = await toWebp(buffer)
    const imageUrl = await webp2png(stickerBuffer)
    if (!imageUrl) throw new Error('No se pudo convertir a imagen')

    await conn.sendMessage(m.chat, {
      image: { url: imageUrl },
      ...extra
    }, { quoted: m })
  } catch (e) {
    console.error(chalk.red('[sss] Error:'), e)
    conn.reply(
      m.chat,
      `*[❌] Error al procesar view once: ${e.message || 'desconocido'}*`,
      m,
      rcanal
    )
  }
}

handler.help = ['#sss + {responder foto/video ver una vez} → guarda el contenido']
handler.tags = ['stickers']
handler.command = ['sss']

export default handler
