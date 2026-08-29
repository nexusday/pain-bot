import {
  getMaxSubs,
  setMaxSubs,
  getSubBotSlotsInfo
} from '../lib/max-subs.js'
import * as ws from 'ws'

let handler = async (m, { conn, args, usedPrefix, command, isOwner }) => {
  if (!isOwner) {
    return conn.reply(
      m.chat,
      '[❗] Este comando solo puede usarlo un *owner* del bot.',
      m,
      global.rcanal
    )
  }

  try {
    const info = getSubBotSlotsInfo(ws)

    if (!args[0]) {
      return conn.sendMessage(
        m.chat,
        {
          text:
            `*Límite de Sub-Bots*\n\n` +
            `> *Máximo permitido:* ${info.max}\n` +
            `> *Registrados:* ${info.registered}\n` +
            `> *Conectados ahora:* ${info.connected}\n` +
            `> *Plazas libres:* ${info.available}\n\n` +
            (info.list.length
              ? `> *Números:* ${info.list.map(n => `+${n}`).join(', ')}\n\n`
              : '') +
            `> Cambiar límite:\n> ${usedPrefix + command} <número>\n` +
            `> Ejemplo: ${usedPrefix + command} 5`,
          contextInfo: { ...global.rcanal?.contextInfo }
        },
        { quoted: m }
      )
    }

    const newMax = parseInt(String(args[0]).replace(/\D/g, ''), 10)
    if (!Number.isFinite(newMax)) {
      return m.reply(`*[❗] Usa un número válido.*\n> Ejemplo: ${usedPrefix + command} 5`)
    }

    const prev = getMaxSubs()
    const saved = setMaxSubs(newMax)
    const after = getSubBotSlotsInfo(ws)

    let note = ''
    if (saved < after.registered) {
      note =
        `\n\n> ⚠️ Hay *${after.registered}* sub-bot(s) registrados. ` +
        `No se borró ninguno. Solo no se podrán agregar nuevos hasta bajar de ese número o subir el límite.`
    }

    return conn.sendMessage(
      m.chat,
      {
        text:
          `✅ *Límite actualizado*\n\n` +
          `> *Antes:* ${prev}\n` +
          `> *Ahora:* ${saved}\n` +
          `> *Registrados:* ${after.registered}\n` +
          `> *Plazas libres:* ${after.available}${note}`,
        contextInfo: { ...global.rcanal?.contextInfo }
      },
      { quoted: m }
    )
  } catch (e) {
    console.error('Error en maxsubs:', e)
    return m.reply(`*[❌] ${e?.message || 'Error al actualizar el límite.'}`)
  }
}

handler.help = ['#maxsubs <número> → límite de sub-bots']
handler.tags = ['subbots', 'owner']
handler.command = ['maxsubs', 'maxsub', 'limsubs']
handler.owner = true

export default handler
