import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import {
  findGroupParticipant,
  findBotParticipant,
  jidsParticipante,
  jidsSeSolapan,
  candidatosJidRemitente
} from './group-participant.js'
import { isOwnerJid, isSenderBotOwner } from './resolve-group-target.js'

const DIR_STICKER_BAN = path.join(process.cwd(), 'storage', 'sticker-ban')

function chatIdANombreArchivo(chatId = '') {
  return String(chatId).replace(/[^a-zA-Z0-9._@-]/g, '_') + '.webp'
}

export function rutaArchivoStickerBan(chatId) {
  return path.join(DIR_STICKER_BAN, chatIdANombreArchivo(chatId))
}

export function guardarArchivoStickerBan(chatId, buffer) {
  if (!chatId || !buffer?.length) return null
  fs.mkdirSync(DIR_STICKER_BAN, { recursive: true })
  const ruta = rutaArchivoStickerBan(chatId)
  fs.writeFileSync(ruta, buffer)
  return ruta
}

export function leerArchivoStickerBan(chatId) {
  try {
    const ruta = rutaArchivoStickerBan(chatId)
    if (!fs.existsSync(ruta)) return null
    const buf = fs.readFileSync(ruta)
    return buf?.length ? buf : null
  } catch {
    return null
  }
}

export function borrarArchivoStickerBan(chatId) {
  try {
    const ruta = rutaArchivoStickerBan(chatId)
    if (fs.existsSync(ruta)) fs.unlinkSync(ruta)
  } catch {}
}


export async function descargarBufferSticker(m) {
  if (!m) return null
  try {
    if (m.quoted && typeof m.quoted.download === 'function') {
      const buf = await m.quoted.download()
      if (buf?.length) return Buffer.from(buf)
    }
  } catch {}
  try {
    const esSticker =
      m.mtype === 'stickerMessage' ||
      m.mediaType === 'stickerMessage' ||
      !!m.message?.stickerMessage
    if (esSticker && typeof m.download === 'function') {
      const buf = await m.download()
      if (buf?.length) return Buffer.from(buf)
    }
  } catch {}
  return null
}


export async function resolverJidMencionSetBy(setBy, chatId, conn, participants = []) {
  const crudo = String(setBy || '').trim()
  if (!crudo) return null

  const part = findGroupParticipant(participants, { sender: crudo }, conn)
  if (part) {
    const phone = part.phoneNumber
      ? (String(part.phoneNumber).includes('@')
        ? part.phoneNumber
        : `${String(part.phoneNumber).replace(/\D/g, '')}@s.whatsapp.net`)
      : ''
    if (phone && String(phone).endsWith('@s.whatsapp.net')) {
      return conn?.decodeJid?.(phone) || phone
    }
    const id = part.id || part.jid
    if (id && String(id).endsWith('@s.whatsapp.net')) {
      return conn?.decodeJid?.(id) || id
    }
  }

  let jid = crudo
  if (jid.endsWith('@lid') || jid.endsWith('@hosted.lid')) {
    try {
      const real = await String.prototype.resolveLidToRealJid.call(jid, chatId, conn, 2, 0)
      if (real && String(real).endsWith('@s.whatsapp.net')) {
        return conn?.decodeJid?.(real) || real
      }
      if (real) jid = real
    } catch {}
  }

  return conn?.decodeJid?.(jid) || jid
}

export function asegurarDbStickerBan() {
  if (!global.db) return null
  if (!global.db.data) global.db.data = {}
  if (!global.db.data.stickerBan || typeof global.db.data.stickerBan !== 'object') {
    global.db.data.stickerBan = {}
  }
  return global.db.data.stickerBan
}


function bufferABase64(valor) {
  if (valor == null || valor === '') return null
  try {
    if (typeof valor === 'string') return valor.length >= 8 ? valor : null
    if (Buffer.isBuffer(valor)) return valor.toString('base64')
    if (valor instanceof Uint8Array) return Buffer.from(valor).toString('base64')
    if (ArrayBuffer.isView(valor)) {
      return Buffer.from(valor.buffer, valor.byteOffset, valor.byteLength).toString('base64')
    }
    if (valor?.type === 'Buffer' && Array.isArray(valor.data)) {
      return Buffer.from(valor.data).toString('base64')
    }
    if (Array.isArray(valor) && valor.length >= 8 && valor.every(n => typeof n === 'number')) {
      return Buffer.from(valor).toString('base64')
    }
    
    if (typeof valor === 'object') {
      const keys = Object.keys(valor)
      if (
        keys.length >= 8 &&
        keys.every(k => /^\d+$/.test(k)) &&
        keys.every(k => typeof valor[k] === 'number')
      ) {
        const arr = keys
          .map(Number)
          .sort((a, b) => a - b)
          .map(i => valor[i])
        return Buffer.from(arr).toString('base64')
      }
      if (typeof valor.toJSON === 'function') {
        const j = valor.toJSON()
        if (j?.type === 'Buffer' && Array.isArray(j.data)) return Buffer.from(j.data).toString('base64')
        if (Array.isArray(j)) return Buffer.from(j).toString('base64')
        if (j?.data) return Buffer.from(j.data).toString('base64')
      }
    }
  } catch {}
  return null
}

function hashesDesdeStickerMsg(st) {
  if (!st || typeof st !== 'object') return []
  const hashes = []
  for (const clave of ['fileSha256', 'fileEncSha256']) {
    const h = bufferABase64(st[clave])
    if (h) hashes.push(h)
  }
  return hashes
}

function desempaquetarMensaje(message) {
  if (!message || typeof message !== 'object') return null
  let cur = message
  for (let i = 0; i < 8; i++) {
    if (cur.ephemeralMessage?.message) {
      cur = cur.ephemeralMessage.message
      continue
    }
    if (cur.viewOnceMessage?.message) {
      cur = cur.viewOnceMessage.message
      continue
    }
    if (cur.viewOnceMessageV2?.message) {
      cur = cur.viewOnceMessageV2.message
      continue
    }
    if (cur.viewOnceMessageV2Extension?.message) {
      cur = cur.viewOnceMessageV2Extension.message
      continue
    }
    if (cur.documentWithCaptionMessage?.message) {
      cur = cur.documentWithCaptionMessage.message
      continue
    }
    if (cur.editedMessage?.message) {
      cur = cur.editedMessage.message
      continue
    }
    break
  }
  return cur
}

function stickerDesdeContenido(contenido) {
  if (!contenido || typeof contenido !== 'object') return null
  if (contenido.stickerMessage) return contenido.stickerMessage
  const inner = desempaquetarMensaje(contenido)
  if (inner?.stickerMessage) return inner.stickerMessage
  return null
}

function contextInfoDe(m) {
  if (!m) return null
  if (m.msg?.contextInfo) return m.msg.contextInfo

  const contenido = desempaquetarMensaje(m.message) || m.message
  if (!contenido) return null

  return (
    contenido.extendedTextMessage?.contextInfo ||
    contenido.imageMessage?.contextInfo ||
    contenido.videoMessage?.contextInfo ||
    contenido.stickerMessage?.contextInfo ||
    contenido.documentMessage?.contextInfo ||
    contenido.buttonsResponseMessage?.contextInfo ||
    contenido.templateButtonReplyMessage?.contextInfo ||
    contenido.listResponseMessage?.contextInfo ||
    null
  )
}

function recolectarCandidatosSticker(m) {
  if (!m) return []
  const candidatos = []
  const push = (st) => {
    if (st && typeof st === 'object') candidatos.push(st)
  }

  const contenido = desempaquetarMensaje(m.message) || m.message
  push(stickerDesdeContenido(contenido))
  push(stickerDesdeContenido(m.mediaMessage))

  if (m.mtype === 'stickerMessage') push(m.msg || m)
  if (m.msg?.stickerMessage) push(m.msg.stickerMessage)
  if (m.stickerMessage) push(m.stickerMessage)
  if (m.fileSha256 || m.fileEncSha256) push(m)

  const q = m.quoted
  if (q) {
    push(stickerDesdeContenido(q.message))
    push(stickerDesdeContenido(q.mediaMessage))
    if (q.mtype === 'stickerMessage' || q.mediaType === 'stickerMessage') {
      push(q.msg || q)
      push(q.mediaMessage?.stickerMessage)
    }
    if (q.msg?.stickerMessage) push(q.msg.stickerMessage)
    if (q.stickerMessage) push(q.stickerMessage)
    if (q.fileSha256 || q.fileEncSha256) push(q)
  }

  const ctx = contextInfoDe(m)
  const quotedMsg = ctx?.quotedMessage
  push(stickerDesdeContenido(quotedMsg))

  return candidatos
}


export function extraerHashesSticker(m) {
  if (!m) return []
  const hashes = []
  for (const st of recolectarCandidatosSticker(m)) {
    hashes.push(...hashesDesdeStickerMsg(st))
  }
  return [...new Set(hashes.filter(Boolean))]
}

function cargarStickerCitadoDesdeStore(conn, m) {
  const idEstrofa = m?.quoted?.id || contextInfoDe(m)?.stanzaId
  if (!idEstrofa || !conn?.chats) return null

  const ctx = contextInfoDe(m)
  const jidRemoto = ctx?.remoteJid || m?.quoted?.chat || m?.chat
  const participante = ctx?.participant
  const candidatos = []
  const vistos = new Set()

  const agregar = (entrada) => {
    if (!entrada?.message || vistos.has(entrada)) return
    vistos.add(entrada)
    candidatos.push(entrada)
  }

  if (jidRemoto) agregar(conn.chats[jidRemoto]?.messages?.[idEstrofa])
  if (m?.chat) agregar(conn.chats[m.chat]?.messages?.[idEstrofa])
  if (participante) agregar(conn.chats[participante]?.messages?.[idEstrofa])

  for (const chat of Object.values(conn.chats || {})) {
    agregar(chat?.messages?.[idEstrofa])
    if (candidatos.length) break
  }

  return candidatos[0] || null
}


export async function extraerHashesStickerCompleto(m, conn) {
  const hashes = new Set(extraerHashesSticker(m))

  if (conn) {
    try {
      const stored = cargarStickerCitadoDesdeStore(conn, m)
      if (stored?.message) {
        for (const h of extraerHashesSticker({ message: stored.message })) {
          hashes.add(h)
        }
      }
    } catch {}
  }

  if (!hashes.size) {
    try {
      const q = m?.quoted
      const descargar =
        (typeof q?.download === 'function' && q.download.bind(q)) ||
        (typeof m?.download === 'function' &&
          (m.mtype === 'stickerMessage' || m.mediaType === 'stickerMessage') &&
          m.download.bind(m)) ||
        null

      if (descargar) {
        const buf = await descargar()
        if (buf?.length) {
          hashes.add(createHash('sha256').update(buf).digest('base64'))
        }
      }
    } catch (e) {
      console.error('[sticker-ban] download hash:', e?.message || e)
    }
  }

  return [...hashes].filter(Boolean)
}

export function obtenerStickerBan(chatId) {
  const db = asegurarDbStickerBan()
  if (!db || !chatId) return null
  const entry = db[chatId]
  if (!entry?.hashes?.length) return null
  return entry
}

export function guardarStickerBan(
  chatId,
  hashes,
  { setBy = '', setByPn = '', name = '', stickerBuffer = null } = {}
) {
  const db = asegurarDbStickerBan()
  if (!db || !chatId || !hashes?.length) {
    throw new Error('datos_invalidos')
  }

  let stickerPath = ''
  if (stickerBuffer?.length) {
    try {
      stickerPath = guardarArchivoStickerBan(chatId, stickerBuffer) || ''
    } catch (e) {
      console.error('[sticker-ban] save file:', e?.message || e)
    }
  }

  db[chatId] = {
    hashes: [...new Set(hashes.filter(Boolean))],
    setBy: String(setBy || ''),
    setByPn: String(setByPn || ''),
    setAt: Date.now(),
    name: String(name || '').slice(0, 40),
    stickerPath: stickerPath || undefined
  }
  return db[chatId]
}

export function quitarStickerBan(chatId) {
  const db = asegurarDbStickerBan()
  if (!db || !chatId || !db[chatId]) return false
  delete db[chatId]
  borrarArchivoStickerBan(chatId)
  return true
}

export function coincideStickerBan(chatId, hashes = []) {
  const entry = obtenerStickerBan(chatId)
  if (!entry?.hashes?.length || !hashes?.length) return false
  const set = new Set(entry.hashes)
  return hashes.some(h => set.has(h))
}

export function esAdminOOwnerGrupo(m, conn, participants, isAdmin = false) {
  const usuario = findGroupParticipant(participants, m, conn) || {}
  const esAdminGrupo =
    Boolean(isAdmin) ||
    usuario?.admin === 'admin' ||
    usuario?.admin === 'superadmin'
  return esAdminGrupo || isSenderBotOwner(m, conn)
}

export async function ejecutarBanPorSticker(m, conn, participants = []) {
  if (!m?.isGroup) return { ok: false, detail: 'no_grupo' }
  if (m.isBaileys) return { ok: false, detail: 'baileys' }

  const hashes = await extraerHashesStickerCompleto(m, conn)
  if (!hashes.length) return { ok: false, detail: 'no_sticker' }
  if (!coincideStickerBan(m.chat, hashes)) return { ok: false, detail: 'no_match' }

  if (!esAdminOOwnerGrupo(m, conn, participants)) {
    return { ok: false, detail: 'sin_permiso' }
  }

  const botPart = findBotParticipant(participants, conn)
  const botEsAdmin =
    botPart?.admin === 'admin' || botPart?.admin === 'superadmin'
  if (!botEsAdmin) return { ok: false, detail: 'bot_no_admin' }

  const quotedSender =
    (typeof m.quoted?.sender === 'string' && m.quoted.sender) ||
    m.msg?.contextInfo?.participant ||
    contextInfoDe(m)?.participant ||
    m.message?.stickerMessage?.contextInfo?.participant ||
    null

  if (!quotedSender && !m.quoted) {
    return { ok: false, detail: 'falta_reply' }
  }

  const idsObjetivo = candidatosJidRemitente(
    m.quoted || { sender: quotedSender, key: { participant: quotedSender } },
    conn,
    [quotedSender].filter(Boolean)
  )

  const participante = findGroupParticipant(participants, idsObjetivo, conn)
  if (!participante) return { ok: false, detail: 'no_en_grupo' }

  const quien = participante.id || participante.jid || quotedSender
  const ids = [
    ...jidsParticipante(participante, conn),
    ...idsObjetivo,
    quien
  ].filter(Boolean)

  if (participante.admin === 'admin' || participante.admin === 'superadmin') {
    return { ok: false, detail: 'objetivo_admin' }
  }

  if (isOwnerJid(ids, conn)) {
    return { ok: false, detail: 'objetivo_owner' }
  }

  const idsBot = jidsParticipante(botPart, conn).concat(
    [conn.user?.jid, conn.user?.id].filter(Boolean)
  )
  if (jidsSeSolapan(ids, idsBot)) {
    return { ok: false, detail: 'objetivo_bot' }
  }

  if (jidsSeSolapan(ids, candidatosJidRemitente(m, conn))) {
    return { ok: false, detail: 'objetivo_self' }
  }

  await conn.groupParticipantsUpdate(m.chat, [quien], 'remove')

  if (!global.db.data.users[quien]) global.db.data.users[quien] = {}
  global.db.data.users[quien].banned = true

  return { ok: true, quien, detail: 'baneado' }
}

export function textoErrorBanSticker(detail, usedPrefix = '.') {
  const map = {
    falta_reply: `[❗] Responde al *mensaje* de alguien con el sticker ban.\n> Configurar: ${usedPrefix}sban (respondiendo un sticker)`,
    sin_permiso: '[❗] Solo admins/owners pueden banear con sticker.',
    bot_no_admin: '[❗] Necesito ser administrador del grupo.',
    no_en_grupo: '[❗] No encontré a ese usuario en el grupo.',
    objetivo_admin: '[❗] No puedes eliminar a un administrador del grupo.',
    objetivo_owner: '[❗] No puedes eliminar a un propietario del bot.',
    objetivo_bot: '[❗] No puedes banear al bot.',
    objetivo_self: '[❗] No puedes banearte a ti mismo.'
  }
  return map[detail] || null
}
