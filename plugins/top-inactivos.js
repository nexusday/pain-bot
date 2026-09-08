import { listInactiveInGroup } from '../lib/msg-activity.js'

let handler = async (m, { conn, usedPrefix }) => {
  if (!m.isGroup) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Este comando solo funciona en grupos.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  }

  try {
    let participants = []
    try {
      const meta = await conn.groupMetadata(m.chat)
      participants = meta?.participants || []
    } catch {
      participants = conn.chats?.[m.chat]?.metadata?.participants || []
    }

    const inactive = listInactiveInGroup(conn, m.chat, participants)
    if (!inactive.length) {
      return conn.sendMessage(m.chat, {
        text: `👻 *TOP INACTIVOS*\n\n> No hay miembros sin mensajes registrados en este grupo.\n> (El conteo empieza desde que el bot registra actividad)`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    const shown = inactive.slice(0, 20)
    const mentions = inactive.map(x => x.jid)
    const lines = shown.map((row, i) => {
      const pos = i + 1
      return [
        `*#${pos}* @${String(row.jid).split('@')[0]}`,
        `> 𓂃 ࣪ ִֶָ☾.  ${row.name}`,
        `> 𓂃 ࣪ ִֶָ☾.  Mensajes en este grupo: *0*`,
      ].join('\n')
    })

    const more = inactive.length > 20
      ? `\n> … y *${inactive.length - 20}* inactivos más.`
      : ''

    const text = [
      `👻 *TOP INACTIVOS*`,
      `> Miembros sin mensajes en *este grupo*`,
      `> Mostrando *${shown.length}* de *${inactive.length}*`,
      ``,
      ...lines,
      more,
      ``,
      `> Perfil: *${usedPrefix || '.'}perfil @user*`,
    ].filter(Boolean).join('\n')

    await conn.sendMessage(m.chat, {
      text,
      mentions,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  } catch (e) {
    console.error('topinactivos:', e)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo generar el top de inactivos.*\n> ${e?.message || e}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  }
}

handler.help = ['topinactivos']
handler.tags = ['grupo', 'rpg']
handler.command = ['topinactivos', 'inactivos', 'topinactive', 'sinmensajes']
handler.group = true

export default handler
