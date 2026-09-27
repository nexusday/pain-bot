import { configurarAntiSimple } from '../lib/Antis/anti-modo.js'

let handler = async (m, { conn, args, usedPrefix, command }) =>
  configurarAntiSimple(m, conn, {
    args, usedPrefix, command, dbKey: 'antiImg', nombre: 'Anti-imagenes',
  })

handler.command = ['antiimg']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
