import sharp from 'sharp'
import { addExif } from '../lib/sticker.js'

const SIZE = 512
const AVATAR_SIZE = 132
const AVATAR_X = 36
const TEXT_X = 188
const BUBBLE_MAX_WIDTH = 292
const MAX_MSG = 120
const MAX_LINES = 6

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function wrapParagraph(paragraph, maxChars) {
  const words = paragraph.split(/\s+/).filter(Boolean)
  if (!words.length) return []

  const lines = []
  let current = ''

  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (test.length <= maxChars) {
      current = test
      continue
    }
    if (current) lines.push(current)
    if (word.length > maxChars) {
      for (let i = 0; i < word.length; i += maxChars) {
        lines.push(word.slice(i, i + maxChars))
      }
      current = ''
    } else {
      current = word
    }
  }

  if (current) lines.push(current)
  return lines
}

function wrapMessage(text) {
  const maxChars = 22
  const parts = text.split('\n').map(p => p.trim())
  const lines = []

  for (const part of parts) {
    if (!part) continue
    lines.push(...wrapParagraph(part, maxChars))
  }

  if (lines.length > MAX_LINES) {
    lines.length = MAX_LINES
    lines[MAX_LINES - 1] = `${lines[MAX_LINES - 1].slice(0, 18)}…`
  }

  return lines.length ? lines : [text.slice(0, maxChars)]
}

function calcMessageFont(lines) {
  const count = lines.length
  if (count <= 2) return 30
  if (count <= 4) return 26
  return 22
}

function buildOverlaySvg(pushname, lines) {
  const msgFont = calcMessageFont(lines)
  const lineHeight = msgFont * 1.28
  const nameFont = 28
  const bubblePadX = 18
  const bubblePadY = 14
  const bubbleWidth = BUBBLE_MAX_WIDTH
  const bubbleHeight = bubblePadY * 2 + lines.length * lineHeight
  const nameY = 168
  const bubbleY = nameY + 18
  const textStartY = bubbleY + bubblePadY + msgFont * 0.85

  const msgTspans = lines.map((line, i) => {
    const y = textStartY + i * lineHeight
    return `<tspan x="${TEXT_X + bubblePadX}" y="${y}">${escapeXml(line)}</tspan>`
  }).join('')

  return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <text x="${TEXT_X}" y="${nameY}" font-family="Segoe UI, Arial, sans-serif"
    font-size="${nameFont}" font-weight="700" fill="#25D366">${escapeXml(pushname)}</text>
  <rect x="${TEXT_X}" y="${bubbleY}" width="${bubbleWidth}" height="${bubbleHeight}"
    rx="20" ry="20" fill="#FFFFFF" stroke="#ECECEC" stroke-width="1"/>
  <text font-family="Segoe UI, Arial, sans-serif" font-size="${msgFont}"
    font-weight="500" fill="#111111">${msgTspans}</text>
</svg>`
}

function defaultAvatarSvg(letter) {
  const safe = escapeXml(letter.slice(0, 1).toUpperCase() || '?')
  return `<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" fill="#DFE5E7"/>
  <text x="50%" y="54%" font-family="Arial, sans-serif" font-size="52" font-weight="700"
    fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">${safe}</text>
</svg>`
}

function loadQuotedFromStore(conn, m) {
  const stanzaId = m.quoted?.id || m.msg?.contextInfo?.stanzaId
  if (!stanzaId || !conn?.chats) return null

  const remoteJid = m.msg?.contextInfo?.remoteJid || m.quoted?.chat || m.chat
  const participant = m.msg?.contextInfo?.participant
  const candidates = []
  const seen = new Set()

  const push = (entry) => {
    if (!entry?.message || seen.has(entry)) return
    seen.add(entry)
    candidates.push(entry)
  }

  push(conn.chats[remoteJid]?.messages?.[stanzaId])
  push(conn.chats[m.chat]?.messages?.[stanzaId])
  if (participant) push(conn.chats[participant]?.messages?.[stanzaId])

  for (const chat of Object.values(conn.chats)) {
    push(chat?.messages?.[stanzaId])
    if (candidates.length) break
  }

  return candidates[0] || null
}

function sameJidUser(a, b) {
  if (!a || !b) return false
  const na = String(a).split('@')[0].replace(/\D/g, '')
  const nb = String(b).split('@')[0].replace(/\D/g, '')
  return na.length > 5 && na === nb
}

async function collectUserJids(m, conn, seeds = []) {
  const jids = new Set()
  const add = (jid) => {
    if (!jid || typeof jid !== 'string') return
    const decoded = conn.decodeJid(jid)
    if (!decoded || decoded === 'status@broadcast' || decoded.endsWith('@g.us')) return
    jids.add(decoded)
  }

  for (const seed of seeds) add(seed)

  if (m.isGroup) {
    try {
      const meta = conn.chats[m.chat]?.metadata || await conn.groupMetadata(m.chat).catch(() => null)
      const targets = [...jids]
      for (const p of meta?.participants || []) {
        const pid = conn.decodeJid(p.id)
        if (targets.some(t => t === pid || sameJidUser(t, pid))) {
          add(pid)
          if (p.phoneNumber) add(`${String(p.phoneNumber).replace(/\D/g, '')}@s.whatsapp.net`)
          if (p.lid) add(p.lid.includes('@') ? p.lid : `${p.lid}@lid`)
        }
      }
    } catch {}
  }

  const resolved = []
  for (const jid of jids) {
    if (!jid.includes('@lid') || !m.isGroup) {
      resolved.push(jid)
      continue
    }
    try {
      const real = await Promise.race([
        String.prototype.resolveLidToRealJid.call(jid, m.chat, conn),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
      ])
      if (typeof real === 'string' && real) resolved.push(conn.decodeJid(real))
    } catch {}
    resolved.push(jid)
  }

  return [...new Set(resolved)]
}

async function resolvePushnameForJid(jid, jids, conn, extraNames = []) {
  let pushname = ''

  for (const candidate of extraNames) {
    if (typeof candidate?.then === 'function') candidate = await candidate
    const value = String(candidate || '').trim()
    if (value) {
      pushname = value
      break
    }
  }

  const lookupJids = [...new Set([jid, ...jids].filter(Boolean))]
  if (!pushname) {
    for (const id of lookupJids) {
      const cached = conn.chats?.[id]
      pushname = (cached?.notify || cached?.name || cached?.vname || '').trim()
      if (pushname) break
    }
  }

  if (!pushname) {
    for (const id of lookupJids) {
      pushname = String(await Promise.resolve(conn.getName(id)) || '').trim()
      if (pushname) break
    }
  }

  return pushname || 'Usuario'
}

async function resolveQuotedUser(m, conn) {
  const fullQuoted = m.getQuotedObj?.() || null
  const stored = loadQuotedFromStore(conn, m)
  const ctx = m.msg?.contextInfo
  const seeds = [
    ctx?.participant,
    fullQuoted?.key?.participant,
    fullQuoted?.sender,
    stored?.key?.participant
  ].filter(Boolean)

  const jids = await collectUserJids(m, conn, seeds)
  const primaryJid = jids[0] || null
  if (!primaryJid) return null

  const pushname = await resolvePushnameForJid(primaryJid, jids, conn, [
    fullQuoted?.pushName,
    stored?.pushName,
    fullQuoted?.name
  ])

  return { primaryJid, jids, pushname }
}

async function resolveMentionedUser(m, conn) {
  let mention = m.mentionedJid?.[0]
  if (typeof mention?.then === 'function') mention = await mention

  if (!mention) {
    const parsed = conn.parseMention?.(m.text || '') || []
    mention = parsed[0]
  }

  if (!mention) return null

  mention = conn.decodeJid(mention)
  const jids = await collectUserJids(m, conn, [mention])
  const primaryJid = jids[0] || mention

  const pushname = await resolvePushnameForJid(primaryJid, jids, conn)
  return { primaryJid, jids, pushname }
}

function resolveSwMessage(m, args) {
  let text = args.join(' ').trim()

  if (!text && m.text) {
    const cleaned = m.text.replace(/^[\s\u200e\u200f]*/, '')
    const match = cleaned.match(/^[^\w]?[.!#/]\S+\s+([\s\S]*)$/)
    if (match) text = match[1].trim()
  }

  return text
    .replace(/@\d{5,20}/g, '')
    .replace(/[\u200e\u200f\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasMention(m, conn) {
  if (m.mentionedJid?.length) return true
  return (conn.parseMention?.(m.text || '') || []).length > 0
}

async function downloadImageUrl(conn, url) {
  if (!url) return null

  try {
    const file = await conn.getFile(url)
    if (file?.data?.length > 512) return file.data
  } catch {}

  try {
    const data = await sharp(url).rotate().toBuffer()
    if (data?.length > 512) return data
  } catch {}

  return null
}

async function fetchProfileBuffer(conn, jids, pushname) {
  const tried = new Set()

  for (const jid of jids) {
    if (!jid || tried.has(jid)) continue
    tried.add(jid)

    try {
      let url = await conn.profilePictureUrl(jid, 'image').catch(() => null)
      if (!url) url = await conn.profilePictureUrl(jid, 'preview').catch(() => null)
      const data = await downloadImageUrl(conn, url)
      if (data?.length > 512) return data
    } catch {}
  }

  return sharp(Buffer.from(defaultAvatarSvg(pushname || '?')))
    .resize(AVATAR_SIZE, AVATAR_SIZE)
    .png()
    .toBuffer()
}

async function buildCircleAvatar(buffer) {
  const mask = Buffer.from(
    `<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}">
      <circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" fill="white"/>
    </svg>`
  )

  return sharp(buffer)
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
    .png()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

async function buildSticker(pushname, message, profileBuffer) {
  const lines = wrapMessage(message)
  const avatar = await buildCircleAvatar(profileBuffer)
  const overlay = Buffer.from(buildOverlaySvg(pushname, lines))
  const avatarY = Math.round((SIZE - AVATAR_SIZE) / 2)

  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      { input: avatar, left: AVATAR_X, top: avatarY },
      { input: overlay, left: 0, top: 0 }
    ])
    .webp({ quality: 92 })
    .toBuffer()
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    const mentioned = hasMention(m, conn)
    const quoted = !!m.quoted

    if (!mentioned && !quoted) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Respondé a un mensaje o mencioná al usuario, y escribe el texto que "diría".*\n\nEjemplos:\n> (respondés mensaje)\n> ${usedPrefix + command} Soy tu amigo 😄\n\n> ${usedPrefix + command} @usuario Hola, ¿cómo estás?`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const message = resolveSwMessage(m, args)
    if (!message) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Falta el texto del mensaje.*\n\nEjemplos:\n> ${usedPrefix + command} Hola, ¿cómo estás?\n> ${usedPrefix + command} @usuario Te extraño`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (message.length > MAX_MSG) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Texto muy largo.* Máximo ${MAX_MSG} caracteres.`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const target = mentioned
      ? await resolveMentionedUser(m, conn)
      : await resolveQuotedUser(m, conn)

    if (!target?.primaryJid) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se pudo identificar al usuario.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const { primaryJid, jids, pushname } = target

    const profileBuffer = await fetchProfileBuffer(conn, jids.length ? jids : [primaryJid], pushname)
    const stickerData = await buildSticker(pushname, message, profileBuffer)

    const senderName = await Promise.resolve(conn.getName(m.sender)) || 'Usuario'
    const username = '@' + senderName
    const nombreBot = global.namebot || 'PAIN BOT'
    const packname = `👑 𝗢𝘄𝗻𝗲𝗿𝘀: \n✰ Sunkovv`
    const author = `\n\n🪐 𝗕𝗼𝘁:\n↳${nombreBot}\n\n🍁 𝑼𝒔𝒖𝒂𝒓𝒊𝒐:\n↳${username}`

    const finalSticker = await addExif(stickerData, packname, author)

    await conn.sendFile(m.chat, finalSticker, 'sticker.webp', '', m, null, rcanal)
  } catch (e) {
    console.error('[sw] Error:', e)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al crear sticker: ${e.message || 'desconocido'}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['#sw + {responder o @mención} texto → sticker estilo chat con foto y nombre']
handler.tags = ['stickers']
handler.command = ['sw', 'stickerwa', 'fakemsg', 'msgfake']

export default handler
