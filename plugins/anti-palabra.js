const KNOWN_SUBS = ['on', 'off', 'add', 'del', 'remove', 'list', 'clear', 'action']

async function saveAntiPalabra() {
  try {
    if (global.db?.data) await global.db.write()
  } catch {}
}

async function addBannedWord(cfg, palabra, m) {
  if (!palabra) return m.reply('Palabra vacía.')
  if (cfg.words.includes(palabra)) return m.reply('La palabra ya está en la lista.')
  cfg.words.push(palabra)
  await saveAntiPalabra()
  return m.reply(`Palabra añadida: *${palabra}*\n\n> Activa con *${m.usedPrefix || '.'}antipalabra on* si aún no lo hiciste.`)
}

let handler = async (m, { conn, text, args, usedPrefix, command, isAdmin, isOwner }) => {
  if (!m.isGroup) {
    return conn.sendMessage(m.chat, { text: '[❗] Este comando solo funciona en grupos.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
  }
  if (!isAdmin && !isOwner) {
    return conn.sendMessage(m.chat, { text: '[❗] Sólo administradores pueden configurar antipalabra.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
  }

  m.usedPrefix = usedPrefix
  const chat = m.chat
  const arg = (args || []).map(a => a.trim()).filter(Boolean)
  const sub = (arg[0] || '').toLowerCase()

  if (!global.db) global.db = { data: {} }
  if (!global.db.data.antiPalabra) global.db.data.antiPalabra = {}
  if (!global.db.data.antiPalabra[chat]) {
    global.db.data.antiPalabra[chat] = { enabled: false, words: [], action: 'delete' }
  }

  const cfg = global.db.data.antiPalabra[chat]

  switch (sub) {
    case 'on':
      cfg.enabled = true
      await saveAntiPalabra()
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. *Anti-palabras activado*\n> Palabras: ${cfg.words.length}\n> Acción: ${cfg.action || 'delete'}\n> Por: @${m.sender.split('@')[0]}`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] },
      }, { quoted: m })
    case 'off':
      cfg.enabled = false
      await saveAntiPalabra()
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. *Anti-palabras desactivado*\n> Por: @${m.sender.split('@')[0]}`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] },
      }, { quoted: m })
    case 'add':
      if (!arg[1]) {
        return conn.sendMessage(m.chat, {
          text: `[❗] Uso: ${usedPrefix}${command} add <palabra o frase>`,
          contextInfo: { ...rcanal.contextInfo },
        }, { quoted: m })
      }
      return addBannedWord(cfg, arg.slice(1).join(' ').toLowerCase().trim(), m)
    case 'del':
    case 'remove':
      if (!arg[1]) {
        return conn.sendMessage(m.chat, {
          text: `[❗] Uso: ${usedPrefix}${command} del <palabra|indice>`,
          contextInfo: { ...rcanal.contextInfo },
        }, { quoted: m })
      }
      {
        const target = arg.slice(1).join(' ').toLowerCase().trim()
        let idx = parseInt(target)
        if (!isNaN(idx)) {
          idx -= 1
          if (idx < 0 || idx >= cfg.words.length) return m.reply('Índice inválido.')
          const removed = cfg.words.splice(idx, 1)
          await saveAntiPalabra()
          return m.reply(`Eliminado: ${removed[0]}`)
        }
        const i = cfg.words.indexOf(target)
        if (i === -1) return m.reply('Palabra no encontrada.')
        cfg.words.splice(i, 1)
        await saveAntiPalabra()
        return m.reply(`Palabra eliminada: ${target}`)
      }
    case 'list':
      if (!cfg.words?.length) {
        return conn.sendMessage(m.chat, { text: '[❗] No hay palabras prohibidas configuradas.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
      }
      {
        let txt = `*Palabras prohibidas (${cfg.words.length}):*\n`
        txt += `> Estado: ${cfg.enabled ? 'ON' : 'OFF'} | Acción: ${cfg.action || 'delete'}\n\n`
        cfg.words.forEach((w, i) => { txt += `${i + 1}. ${w}\n` })
        return m.reply(txt)
      }
    case 'clear':
      cfg.words = []
      await saveAntiPalabra()
      return m.reply('Lista de palabras prohibidas vaciada.')
    case 'action':
      if (!arg[1]) {
        return conn.sendMessage(m.chat, {
          text: `[❗] Uso: ${usedPrefix}${command} action <delete|kick>`,
          contextInfo: { ...rcanal.contextInfo },
        }, { quoted: m })
      }
      {
        const act = arg[1].toLowerCase()
        if (!['delete', 'kick'].includes(act)) {
          return conn.sendMessage(m.chat, { text: 'Acción inválida. Opciones: delete, kick', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
        }
        cfg.action = act
        await saveAntiPalabra()
        return m.reply(`Acción de antipalabra: *${act}*`)
      }
    default:
      if (sub && !KNOWN_SUBS.includes(sub)) {
        return addBannedWord(cfg, arg.join(' ').toLowerCase().trim(), m)
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
