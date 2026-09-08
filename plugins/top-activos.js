import { listActiveInGroup } from '../lib/msg-activity.js'

async function getGroupParticipants(conn, chatId) {
  let participants = conn.chats?.[chatId]?.metadata?.participants || []
  if (participants.length) return participants
  try {
    const meta = await conn.groupMetadata(chatId)
    participants = meta?.participants || []
    if (conn.chats?.[chatId]) conn.chats[chatId].metadata = meta
  } catch {}
  return participants
}

let handler = async (m, { conn, usedPrefix, args }) => {
  if (!m.isGroup) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Este comando solo funciona en grupos.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  }

  try {
    const limitRaw = Math.floor(Number(String(args?.[0] || '').replace(/[^\d]/g, '')) || 0)
    const participants = await getGroupParticipants(conn, m.chat)
    const active = listActiveInGroup(conn, m.chat, participants, {
      limit: limitRaw > 0 ? limitRaw : 0,
    })

    if (!active.length) {
      return conn.sendMessage(m.chat, {
        text: `⚡ *TOP ACTIVOS*\n\n> Aún no hay mensajes registrados en este grupo.\n> El conteo empieza cuando hablen con el bot activo aquí.`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    const totalMsgs = active.reduce((s, x) => s + (x.count || 0), 0)
    const mentions = active.map(x => x.jid)
    const list = active
      .map((row, i) => `*#${i + 1}* @${String(row.jid).split('@')[0]} · *${row.count}* msg`)
      .join('\n')

    const text = [
      `⚡ *TOP ACTIVOS*`,
      `> Más mensajes en *este grupo*`,
      `> Personas: *${active.length}* · Msgs: *${totalMsgs}*`,
      ``,
      list,
      ``,
      `> Inactivos: *${usedPrefix || '.'}topinactivos*`,
      `> Perfil: *${usedPrefix || '.'}perfil @user*`,
    ].join('\n')

    await conn.sendMessage(m.chat, {
      text,
      mentions,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  } catch (e) {
    console.error('topactivos:', e)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo generar el top de activos.*\n> ${e?.message || e}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  }
}

handler.help = ['topactivos', 'topactivos <n>']
handler.tags = ['grupo', 'rpg']
handler.command = ['topactivos', 'activos', 'topactive', 'topmsg']
handler.group = true

export default handler
