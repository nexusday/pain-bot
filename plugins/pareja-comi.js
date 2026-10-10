import { MAX_COMISION, establecerComision, obtenerComision, obtenerParejaDe } from '../lib/pareja-comision.js'

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo funciona en grupos.',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const pareja = obtenerParejaDe(m.sender)
    if (!pareja) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Solo las personas casadas pueden usar este comando.\n> Cásate con *${usedPrefix}marry @usuario*`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const actual = obtenerComision(m.sender)
    const arg = String(args[0] || '').toLowerCase().trim()

    if (!arg) {
      return conn.sendMessage(m.chat, {
        text: `💞 *Comisión de pareja*\n\n> Estado: *${actual}%*\n> Tu pareja: @${String(pareja).split('@')[0]}\n\n> Uso: *${usedPrefix + command} <0-${MAX_COMISION}>*\n> Ejemplo: *${usedPrefix + command} 10* → el 10% de lo que ganes en juegos va para tu pareja.\n> *${usedPrefix + command} off* → desactivar.`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [pareja]
        }
      }, { quoted: m })
    }

    if (arg === 'off' || arg === '0') {
      establecerComision(m.sender, 0)
      await global.db.write()
      return conn.sendMessage(m.chat, {
        text: `💞 *Comisión desactivada*\n\n> Ya no compartirás tus ganancias con @${String(pareja).split('@')[0]}.`,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [pareja]
        }
      }, { quoted: m })
    }

    const pct = Math.floor(Number(arg))
    if (!Number.isFinite(pct) || pct < 1 || pct > MAX_COMISION) {
      return conn.sendMessage(m.chat, {
        text: `[❗] El porcentaje debe ser de 1 a ${MAX_COMISION}.\n> Uso: *${usedPrefix + command} 10*`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    establecerComision(m.sender, pct)
    await global.db.write()
    return conn.sendMessage(m.chat, {
      text: `💞 *Comisión activada (${pct}%)*\n\n> De lo que ganes en juegos, el *${pct}%* va para @${String(pareja).split('@')[0]}.\n> Si tu pareja también pone *${usedPrefix}comi*, se comparten mutuamente.`,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender, pareja]
      }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en comi:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al configurar la comisión.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['comip <0-50>\n→ Comparte un % de tus ganancias en juegos con tu pareja']
handler.tags = ['perfiles']
handler.command = ['comip', 'comi', 'comision', 'comisionpareja']
handler.group = true

export default handler
