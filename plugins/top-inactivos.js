import { listInactiveInGroup } from '../lib/msg-activity.js'

let handler = async (m, { conn, usedPrefix }) => {
  if (!m.isGroup) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Este comando solo funciona en grupos.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  }

  try {
    // Cache local primero (evita groupMetadata lento)
    let participants = conn.chats?.[m.chat]?.metadata?.participants || []
    if (!participants.length) {
      try {
        const meta = await conn.groupMetadata(m.chat)
        participants = meta?.participants || []
        if (conn.chats?.[m.chat]) {
          conn.chats[m.chat].metadata = meta
        }
      } catch {}
    }

    const inactivos = listInactiveInGroup(conn, m.chat, participants)
    if (!inactivos.length) {
      return conn.sendMessage(m.chat, {
        text: `👻 *TOP INACTIVOS*\n\n> No hay miembros sin mensajes registrados en este grupo.\n> (El conteo empieza desde que el bot registra actividad)`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    const menciones = inactivos.map(x => x.jid)
    // Formato compacto: 1 línea por persona (mensaje único y rápido)
    const lista = inactivos
      .map((row, i) => `*#${i + 1}* @${String(row.jid).split('@')[0]}`)
      .join('\n')

    const text = [
      `👻 *TOP INACTIVOS*`,
      `> Sin mensajes en *este grupo* · Total: *${inactivos.length}*`,
      ``,
      lista,
      ``,
      `> Perfil: *${usedPrefix || '.'}perfil @user*`,
    ].join('\n')

    await conn.sendMessage(m.chat, {
      text,
      mentions: menciones,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  } catch (error) {
    console.error('topinactivos:', error)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo generar el top de inactivos.*\n> ${error?.message || error}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  }
}

handler.help = ['topinactivos']
handler.tags = ['grupo', 'rpg']
handler.command = ['topinactivos', 'inactivos', 'topinactive', 'sinmensajes']
handler.group = true

export default handler
