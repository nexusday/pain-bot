import { listActiveInGroup } from '../lib/msg-activity.js'

async function obtenerParticipantesGrupo(conn, idChat) {
  let participants = conn.chats?.[idChat]?.metadata?.participants || []
  if (participants.length) return participants
  try {
    const meta = await conn.groupMetadata(idChat)
    participants = meta?.participants || []
    if (conn.chats?.[idChat]) conn.chats[idChat].metadata = meta
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
    const limiteCrudo = Math.floor(Number(String(args?.[0] || '').replace(/[^\d]/g, '')) || 0)
    const participants = await obtenerParticipantesGrupo(conn, m.chat)
    const activos = listActiveInGroup(conn, m.chat, participants, {
      limit: limiteCrudo > 0 ? limiteCrudo : 0,
    })

    if (!activos.length) {
      return conn.sendMessage(m.chat, {
        text: `⚡ *TOP ACTIVOS*\n\n> Aún no hay mensajes registrados en este grupo.\n> El conteo empieza cuando hablen con el bot activo aquí.`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    const totalMensajes = activos.reduce((s, x) => s + (x.count || 0), 0)
    const menciones = activos.map(x => x.jid)
    const lista = activos
      .map((row, i) => `*#${i + 1}* @${String(row.jid).split('@')[0]} · *${row.count}* msg`)
      .join('\n')

    const text = [
      `⚡ *TOP ACTIVOS*`,
      `> Más mensajes en *este grupo*`,
      `> Personas: *${activos.length}* · Msgs: *${totalMensajes}*`,
      ``,
      lista,
      ``,
      `> Inactivos: *${usedPrefix || '.'}topinactivos*`,
      `> Perfil: *${usedPrefix || '.'}perfil @user*`,
    ].join('\n')

    await conn.sendMessage(m.chat, {
      text,
      mentions: menciones,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  } catch (error) {
    console.error('topactivos:', error)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo generar el top de activos.*\n> ${error?.message || error}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  }
}

handler.help = ['topactivos', 'topactivos <n>']
handler.tags = ['grupo', 'rpg']
handler.command = ['topactivos', 'activos', 'topactive', 'topmsg']
handler.group = true

export default handler
