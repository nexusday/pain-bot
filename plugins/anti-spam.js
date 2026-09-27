import { configurarAntiSimple } from '../lib/Antis/anti-modo.js'

let handler = async (m, { conn, args, usedPrefix, command }) =>
  configurarAntiSimple(m, conn, {
    args,
    usedPrefix,
    command,
    dbKey: 'antiSpam',
    nombre: 'Anti-spam',
    legacy: 'all',
  })

handler.command = ['antispam']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
