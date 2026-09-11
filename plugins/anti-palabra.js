const SUBCOMANDOS_CONOCIDOS = ['on', 'off', 'add', 'del', 'remove', 'list', 'clear', 'action']

import { normalizeAntiText, sanitizeAntiPalabraWords, ensureAntiPalabraStore } from '../lib/Antis/anti-palabra.js'

async function guardarAntiPalabra() {
  try {
    if (global.db?.data) await global.db.write()
  } catch {}
}

async function agregarPalabraProhibida(config, palabra, m) {
  const normalizado = normalizeAntiText(palabra)
  if (!normalizado) return m.reply('Palabra vacía.')
  if (config.words.some(w => normalizeAntiText(w) === normalizado)) {
    return m.reply('La palabra ya está en la lista.')
  }
  config.words.push(normalizado)
  await guardarAntiPalabra()
  return m.reply(`Palabra añadida: *${normalizado}*\n\n> Activa con *${m.usedPrefix || '.'}antipalabra on* si aún no lo hiciste.`)
}

let handler = async (m, { conn, text, args, usedPrefix, command, isAdmin, isOwner }) => {
  if (!m.isGroup) {
    return conn.sendMessage(m.chat, { text: '[❗] Este comando solo funciona en grupos.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
  }
  if (!isAdmin && !isOwner) {
    return conn.sendMessage(m.chat, { text: '[❗] Sólo administradores pueden configurar antipalabra.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
  }

  m.usedPrefix = usedPrefix
  const idChat = m.chat
  const argumentosArr = (args || []).map(a => a.trim()).filter(Boolean)
  const subcomando = (argumentosArr[0] || '').toLowerCase()

  if (!global.db) global.db = { data: {} }
  ensureAntiPalabraStore()
  if (!global.db.data.antiPalabra[idChat]) {
    global.db.data.antiPalabra[idChat] = { enabled: false, words: [], action: 'delete' }
  }

  const config = global.db.data.antiPalabra[idChat]
  config.words = sanitizeAntiPalabraWords(config.words)

  switch (subcomando) {
    case 'on':
      config.enabled = true
      await guardarAntiPalabra()
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. *Anti-palabras activado*\n> Palabras: ${config.words.length}\n> Acción: ${config.action || 'delete'}\n> Por: @${m.sender.split('@')[0]}`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] },
      }, { quoted: m })
    case 'off':
      config.enabled = false
      await guardarAntiPalabra()
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. *Anti-palabras desactivado*\n> Por: @${m.sender.split('@')[0]}`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] },
      }, { quoted: m })
    case 'add':
      if (!argumentosArr[1]) {
        return conn.sendMessage(m.chat, {
          text: `[❗] Uso: ${usedPrefix}${command} add <palabra o frase>`,
          contextInfo: { ...rcanal.contextInfo },
        }, { quoted: m })
      }
      return agregarPalabraProhibida(config, argumentosArr.slice(1).join(' ').trim(), m)
    case 'del':
    case 'remove':
      if (!argumentosArr[1]) {
        return conn.sendMessage(m.chat, {
          text: `[❗] Uso: ${usedPrefix}${command} del <palabra|indice>`,
          contextInfo: { ...rcanal.contextInfo },
        }, { quoted: m })
      }
      {
        const objetivo = normalizeAntiText(argumentosArr.slice(1).join(' '))
        let idx = parseInt(argumentosArr[1])
        if (!isNaN(idx)) {
          idx -= 1
          if (idx < 0 || idx >= config.words.length) return m.reply('Índice inválido.')
          const eliminado = config.words.splice(idx, 1)
          await guardarAntiPalabra()
          return m.reply(`Eliminado: ${eliminado[0]}`)
        }
        const i = config.words.findIndex(w => normalizeAntiText(w) === objetivo)
        if (i === -1) return m.reply('Palabra no encontrada.')
        config.words.splice(i, 1)
        await guardarAntiPalabra()
        return m.reply(`Palabra eliminada: ${objetivo}`)
      }
    case 'list':
      if (!config.words?.length) {
        return conn.sendMessage(m.chat, { text: '[❗] No hay palabras prohibidas configuradas.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
      }
      {
        let texto = `*Palabras prohibidas (${config.words.length}):*\n`
        texto += `> Estado: ${config.enabled ? 'ON' : 'OFF'} | Acción: ${config.action || 'delete'}\n\n`
        config.words.forEach((w, i) => { texto += `${i + 1}. ${w}\n` })
        return m.reply(texto)
      }
    case 'clear':
      config.words = []
      await guardarAntiPalabra()
      return m.reply('Lista de palabras prohibidas vaciada.')
    case 'action':
      if (!argumentosArr[1]) {
        return conn.sendMessage(m.chat, {
          text: `[❗] Uso: ${usedPrefix}${command} action <delete|kick>`,
          contextInfo: { ...rcanal.contextInfo },
        }, { quoted: m })
      }
      {
        const acto = argumentosArr[1].toLowerCase()
        if (!['delete', 'kick'].includes(acto)) {
          return conn.sendMessage(m.chat, { text: 'Acción inválida. Opciones: delete, kick', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
        }
        config.action = acto
        await guardarAntiPalabra()
        return m.reply(`Acción de antipalabra: *${acto}*`)
      }
    default:
      if (subcomando && !SUBCOMANDOS_CONOCIDOS.includes(subcomando)) {
        return agregarPalabraProhibida(config, argumentosArr.join(' ').trim(), m)
      }
      return conn.sendMessage(m.chat, {
        text: `[❗] Uso de *antipalabra*\n\n` +
          `> *${usedPrefix}${command} on* — Activar\n` +
          `> *${usedPrefix}${command} off* — Desactivar\n` +
          `> *${usedPrefix}${command} add robux* — Añadir palabra\n` +
          `> *${usedPrefix}${command} robux* — Atajo para añadir\n` +
          `> *${usedPrefix}${command} add vendo diamantes* — Añadir frase\n` +
          `> *${usedPrefix}${command} del robux* — Quitar\n` +
          `> *${usedPrefix}${command} list* — Ver lista\n` +
          `> *${usedPrefix}${command} action delete* — Solo borrar\n` +
          `> *${usedPrefix}${command} action kick* — Borrar y expulsar\n\n` +
          `⊹ Detecta la palabra dentro del mensaje ⊹\n` +
          `Ej: "hola *robux* como estas"`,
        contextInfo: { ...rcanal.contextInfo },
      }, { quoted: m })
  }
}

handler.help = ['antipalabra']
handler.tags = ['anti']
handler.command = ['antipalabra']
handler.group = true
handler.admin = true

export default handler
