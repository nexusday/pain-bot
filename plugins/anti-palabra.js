let handler = async (m, { conn, text, args, usedPrefix, command, isAdmin, isOwner }) => {
  if (!m.isGroup) {
    return conn.sendMessage(m.chat, { text: '[❗] Este comando solo funciona en grupos.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
  }
  if (!isAdmin && !isOwner) return conn.sendMessage(m.chat, { text: '[❗] Sólo administradores pueden configurar antipalabra.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })

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
      {
        let txt = `ִֶָ☾. *Anti-palabras activado correctamente*\n> Por: @${m.sender.split('@')[0]}`
        return conn.sendMessage(m.chat, { text: txt, contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] } }, { quoted: m })
      }
      break
    case 'off':
      cfg.enabled = false
      {
        let txt = `ִֶָ☾. *Anti-palabras desactivado correctamente*\n> Por: @${m.sender.split('@')[0]}`
        return conn.sendMessage(m.chat, { text: txt, contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] } }, { quoted: m })
      }
      break
    case 'add':
      if (!arg[1]) return conn.sendMessage(m.chat, { text: `[❗] Uso: ${usedPrefix}${command} add <palabra>`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
      {
        const palabra = arg.slice(1).join(' ').toLowerCase().trim()
        if (!palabra) return m.reply('Palabra vacía.')
        if (cfg.words.includes(palabra)) return m.reply('La palabra ya está en la lista.')
        cfg.words.push(palabra)
        m.reply(`Palabra añadida: ${palabra}`)
      }
      break
    case 'del':
    case 'remove':
      if (!arg[1]) return conn.sendMessage(m.chat, { text: `[❗] Uso: ${usedPrefix}${command} del <palabra|indice>`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
      {
        const target = arg.slice(1).join(' ').toLowerCase().trim()
        let idx = parseInt(target)
        if (!isNaN(idx)) {
          idx = idx - 1
          if (idx < 0 || idx >= cfg.words.length) return m.reply('Índice inválido.')
          const removed = cfg.words.splice(idx, 1)
          m.reply(`Eliminado: ${removed[0]}`)
        } else {
          const i = cfg.words.indexOf(target)
          if (i === -1) return m.reply('Palabra no encontrada.')
          cfg.words.splice(i, 1)
          m.reply(`Palabra eliminada: ${target}`)
        }
      }
      break
    case 'list':
      if (!cfg.words || cfg.words.length === 0) return conn.sendMessage(m.chat, { text: '[❗] No hay palabras prohibidas configuradas.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
      {
        let txt = '*Palabras prohibidas:*\n'
        cfg.words.forEach((w, i) => { txt += `${i + 1}. ${w}\n` })
        m.reply(txt)
      }
      break
    case 'clear':
      cfg.words = []
      m.reply('Lista de palabras prohibidas vaciada.')
      break
    case 'action':
      if (!arg[1]) return conn.sendMessage(m.chat, { text: `[❗] Uso: ${usedPrefix}${command} action <delete|kick>`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
      {
        const act = arg[1].toLowerCase()
        if (!['delete', 'kick'].includes(act)) return conn.sendMessage(m.chat, { text: 'Acción inválida. Opciones: delete,kick', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
        cfg.action = act
        m.reply('Acción para antipalabra establecida a: ' + act)
      }
      break
    default:
      return conn.sendMessage(m.chat, {
        text: `[❗] Uso del comando antipalabra.\n\n` +
          `> *Ejemplos:*\n` +
          ` ${usedPrefix}${command} on\n` +
          ` ${usedPrefix}${command} off\n` +
          ` ${usedPrefix}${command} add <palabra>\n` +
          ` ${usedPrefix}${command} del <palabra|indice>\n` +
          ` ${usedPrefix}${command} list\n` +
          ` ${usedPrefix}${command} clear\n` +
          ` ${usedPrefix}${command} action <delete|kick>`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
  }

  
}

handler.help = ['antipalabra']
handler.tags = ['anti']
handler.command = ['antipalabra']
handler.group = true
handler.admin = true

export default handler
