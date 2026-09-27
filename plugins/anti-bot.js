import { configurarAntiSimple } from '../lib/Antis/anti-modo.js'

let handler = async (m, { conn, args, usedPrefix, command }) =>
  configurarAntiSimple(m, conn, {
    args,
    usedPrefix,
    command,
    dbKey: 'antiBot',
    nombre: 'Anti-Bot',
    legacy: 'all',
  })

handler.help = ['#antibot del/all/off']
handler.tags = ['grupo', 'admins']
handler.command = ['antibot', 'antibots', 'nobots']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
