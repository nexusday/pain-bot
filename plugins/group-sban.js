import {
  extraerHashesSticker,
  guardarStickerBan,
  quitarStickerBan,
  obtenerStickerBan,
  coincideStickerBan,
  esAdminOOwnerGrupo,
  ejecutarBanPorSticker,
  textoErrorBanSticker
} from '../lib/sticker-ban.js'

function ayuda(usedPrefix) {
  return (
    `*[🔖] Sticker Ban*\n\n` +
    `*Configurar:* responde a un sticker\n` +
    `> ${usedPrefix}sban\n\n` +
    `*Usar:* responde al mensaje de alguien con ese sticker\n` +
    `(el bot lo banea del grupo)\n\n` +
    `*Ver:* ${usedPrefix}sban ver\n` +
    `*Quitar:* ${usedPrefix}sban del`
  )
}

let handler = async (m, { conn, args, participants, isAdmin, usedPrefix }) => {
  if (!m.isGroup) {
    return conn.reply(m.chat, '[❗] Solo funciona en grupos.', m)
  }

  const metadatos =
    (conn.chats[m.chat] || {}).metadata ||
    (await conn.groupMetadata(m.chat).catch(() => null)) ||
    {}
  const partes = metadatos.participants || participants || []

  if (!esAdminOOwnerGrupo(m, conn, partes, isAdmin)) {
    return conn.reply(m.chat, '[❗] Solo admins/owners pueden usar este comando.', m)
  }

  const sub = String(args[0] || '').toLowerCase().trim()

  if (['ver', 'status', 'info', 'lista'].includes(sub)) {
    const actual = obtenerStickerBan(m.chat)
    if (!actual) {
      return conn.reply(
        m.chat,
        `*[🔖] Sticker Ban*\n\nNo hay sticker configurado en este grupo.\n\n> ${usedPrefix}sban _(responde un sticker)_`,
        m
      )
    }
    return conn.reply(
      m.chat,
      `*[🔖] Sticker Ban*\n\n` +
        `› Estado: *activo*\n` +
        `› Por: @${String(actual.setBy || '').split('@')[0] || '—'}\n` +
        `› Fecha: ${actual.setAt ? new Date(actual.setAt).toLocaleString() : '—'}\n\n` +
        `> Para banear: responde un mensaje con ese sticker.\n` +
        `> Quitar: ${usedPrefix}sban del`,
      m
    )
  }

  if (['del', 'delete', 'quitar', 'remove', 'off'].includes(sub)) {
    const ok = quitarStickerBan(m.chat)
    if (!ok) {
      return conn.reply(m.chat, '[❗] Este grupo no tenía sticker ban.', m)
    }
    try { await global.db.write?.() } catch {}
    return conn.reply(m.chat, '✅ Sticker ban *eliminado* de este grupo.', m)
  }

  const hashesMsg = extraerHashesSticker(m)
  const hashesQuoted = m.quoted ? extraerHashesSticker(m.quoted) : []
  const hashes = hashesMsg.length ? hashesMsg : hashesQuoted

  if (!hashes.length) {
    return conn.reply(m.chat, ayuda(usedPrefix), m)
  }

  const guardado = guardarStickerBan(m.chat, hashes, {
    setBy: m.sender,
    name: m.pushName || ''
  })
  try { await global.db.write?.() } catch {}

  return conn.reply(
    m.chat,
    `✅ *Sticker ban configurado*\n\n` +
      `Ahora, si un *admin/owner* responde un mensaje con ese sticker, el bot baneará a esa persona.\n\n` +
      `> Ver: ${usedPrefix}sban ver\n` +
      `> Quitar: ${usedPrefix}sban del`,
    m
  )
}

handler.all = async function (m, { conn, participants }) {
  try {
    if (!m.isGroup || m.isBaileys) return
    if (m.mtype !== 'stickerMessage' && !m.message?.stickerMessage) return
    if (!m.quoted && !m.msg?.contextInfo?.participant) return

    const hashes = extraerHashesSticker(m)
    if (!hashes.length) return
    if (!coincideStickerBan(m.chat, hashes)) return

    const partes =
      participants ||
      (conn.chats[m.chat] || {}).metadata?.participants ||
      (await conn.groupMetadata(m.chat).catch(() => null))?.participants ||
      []

    const resultado = await ejecutarBanPorSticker(m, conn, partes)
    if (!resultado.ok) {
     
      if (
        ['sin_permiso', 'no_match', 'no_sticker', 'baileys', 'no_grupo', 'falta_reply'].includes(
          resultado.detail
        )
      ) {
        return
      }
      const msg = textoErrorBanSticker(resultado.detail)
      if (msg) await conn.reply(m.chat, msg, m).catch(() => {})
      return
    }

    const metadatos =
      (conn.chats[m.chat] || {}).metadata ||
      (await conn.groupMetadata(m.chat).catch(() => null)) ||
      {}

    await conn.sendMessage(
      m.chat,
      {
        text:
          `🌴 𝗨𝘀𝘂𝗮𝗿𝗶𝗼 𝗯𝗮𝗻𝗲𝗮𝗱𝗼 𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗮𝗺𝗲𝗻𝘁𝗲\n\n` +
          `> *Usuario:* @${String(resultado.quien).split('@')[0]}\n` +
          `> *Por:* @${m.sender.split('@')[0]}\n` +
          `> *Grupo:* ${metadatos.subject || ''}\n`,
        contextInfo: {
          ...(global.rcanal?.contextInfo || {}),
          mentionedJid: [resultado.quien, m.sender]
        }
      },
      { quoted: m }
    )
  } catch (e) {
    console.error('[sticker-ban]', e?.message || e)
  }
}

handler.help = [
  '#sban → configurar sticker ban (responder sticker)',
  '#sban del → quitar',
  '#sban ver → estado'
]
handler.tags = ['grupo', 'admins']
handler.command = ['sban', 'stickerban', 'setbansticker', 'bansticker']
handler.group = true

export default handler
