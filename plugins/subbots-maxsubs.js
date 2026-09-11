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
    const informacion = getSubBotSlotsInfo(ws)

    if (!args[0]) {
      const lineaLimite = informacion.unlimited
        ? `> *Máximo permitido:* Ilimitado\n`
        : `> *Máximo permitido:* ${informacion.max}\n`
      const lineaLibre = informacion.unlimited
        ? `> *Plazas libres:* Ilimitadas\n\n`
        : `> *Plazas libres:* ${informacion.available}\n\n`

      return conn.sendMessage(
        m.chat,
        {
          text:
            `*Límite de Sub-Bots*\n\n` +
            lineaLimite +
            `> *Registrados:* ${informacion.registered}\n` +
            `> *Conectados ahora:* ${informacion.connected}\n` +
            lineaLibre +
            (informacion.list.length
              ? `> *Números:* ${informacion.list.map(n => `+${n}`).join(', ')}\n\n`
              : '') +
            `> Cambiar límite:\n> ${usedPrefix + command} <número>\n` +
            `> *0* = ilimitado\n` +
            `> Ejemplo: ${usedPrefix + command} 10`,
          contextInfo: { ...global.rcanal?.contextInfo }
        },
        { quoted: m }
      )
    }

    const nuevoMax = parseInt(String(args[0]).replace(/\D/g, ''), 10)
    if (!Number.isFinite(nuevoMax)) {
      return m.reply(`*[❗] Usa un número válido.*\n> Ejemplo: ${usedPrefix + command} 5`)
    }

    const anterior = getMaxSubs()
    const guardado = setMaxSubs(nuevoMax)
    const despues = getSubBotSlotsInfo(ws)

    let nota = ''
    if (!despues.unlimited && guardado < despues.registered) {
      nota =
        `\n\n> ⚠️ Hay *${despues.registered}* sub-bot(s) registrados. ` +
        `No se borró ninguno. Solo no se podrán agregar nuevos hasta bajar de ese número o subir el límite.`
    } else if (guardado === 0) {
      nota = `\n\n> Sub-bots *ilimitados*.`
    }

    const etiquetaLimite = guardado === 0 ? 'Ilimitado' : String(guardado)
    const etiquetaAnterior = anterior === 0 ? 'Ilimitado' : String(anterior)
    const etiquetaDisponible = despues.unlimited ? 'Ilimitadas' : String(despues.available)

    return conn.sendMessage(
      m.chat,
      {
        text:
          `✅ *Límite actualizado*\n\n` +
          `> *Antes:* ${etiquetaAnterior}\n` +
          `> *Ahora:* ${etiquetaLimite}\n` +
          `> *Registrados:* ${despues.registered}\n` +
          `> *Plazas libres:* ${etiquetaDisponible}${nota}`,
        contextInfo: { ...global.rcanal?.contextInfo }
      },
      { quoted: m }
    )
  } catch (e) {
    console.error('Error en maxsubs:', e)
    return m.reply(`*[❌] ${e?.message || 'Error al actualizar el límite.'}`)
  }
}

handler.help = ['#maxsubs <número> → límite de sub-bots (0 = ilimitado)']
handler.tags = ['subbots', 'owner']
handler.command = ['maxsubs', 'maxsub', 'limsubs']
handler.owner = true

export default handler
