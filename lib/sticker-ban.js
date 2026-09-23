import {
  findGroupParticipant,
  findBotParticipant,
  jidsParticipante,
  jidsSeSolapan,
  candidatosJidRemitente
} from './group-participant.js'
import { isOwnerJid, isSenderBotOwner } from './resolve-group-target.js'

export function asegurarDbStickerBan() {
  if (!global.db) return null
  if (!global.db.data) global.db.data = {}
  if (!global.db.data.stickerBan || typeof global.db.data.stickerBan !== 'object') {
    global.db.data.stickerBan = {}
  }
  return global.db.data.stickerBan
}

function bufferABase64(valor) {
  if (!valor) return null
  if (Buffer.isBuffer(valor)) return valor.toString('base64')
  if (valor instanceof Uint8Array) return Buffer.from(valor).toString('base64')
  if (typeof valor === 'string' && valor.length >= 8) return valor
  if (valor?.type === 'Buffer' && Array.isArray(valor.data)) {
    return Buffer.from(valor.data).toString('base64')
  }
  if (Array.isArray(valor)) return Buffer.from(valor).toString('base64')
  return null
}

/** Extrae huellas del sticker (fileSha256 / fileEncSha256). */
export function extraerHashesSticker(m) {
  const st =
    m?.message?.stickerMessage ||
    (m?.mtype === 'stickerMessage' ? m.msg : null) ||
    m?.msg?.stickerMessage ||
    m?.quoted?.message?.stickerMessage ||
    m?.quoted?.msg?.stickerMessage ||
    null

  if (!st) return []

  const hashes = []
  for (const clave of ['fileSha256', 'fileEncSha256']) {
    const h = bufferABase64(st[clave])
    if (h) hashes.push(h)
  }
  return [...new Set(hashes)]
}

export function obtenerStickerBan(chatId) {
  const db = asegurarDbStickerBan()
  if (!db || !chatId) return null
  const entry = db[chatId]
  if (!entry?.hashes?.length) return null
  return entry
}

export function guardarStickerBan(chatId, hashes, { setBy = '', name = '' } = {}) {
  const db = asegurarDbStickerBan()
  if (!db || !chatId || !hashes?.length) {
    throw new Error('datos_invalidos')
  }
  db[chatId] = {
    hashes: [...new Set(hashes.filter(Boolean))],
    setBy: String(setBy || ''),
    setAt: Date.now(),
    name: String(name || '').slice(0, 40)
  }
  return db[chatId]
}

export function quitarStickerBan(chatId) {
  const db = asegurarDbStickerBan()
  if (!db || !chatId || !db[chatId]) return false
  delete db[chatId]
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

/**
 * Ban por sticker-reply. Devuelve { ok, detail, quien }.
 */
export async function ejecutarBanPorSticker(m, conn, participants = []) {
  if (!m?.isGroup) return { ok: false, detail: 'no_grupo' }
  if (m.isBaileys) return { ok: false, detail: 'baileys' }

  const hashes = extraerHashesSticker(m)
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

  // No auto-banearse
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
