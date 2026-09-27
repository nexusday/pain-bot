import { configurarAntiSimple } from '../lib/Antis/anti-modo.js'

let handler = async (m, { conn, args, usedPrefix, command }) =>
  configurarAntiSimple(m, conn, {
    args, usedPrefix, command, dbKey: 'antiEstados', nombre: 'Anti-Estados',
  })

handler.help = ['#antiestados del/all/off']
handler.tags = ['grupo', 'admins']
handler.command = ['antiestados', 'antiestado', 'antistatus', 'antistatusmention']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
