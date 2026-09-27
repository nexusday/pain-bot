import { configurarAntiSimple } from '../lib/Antis/anti-modo.js'

let handler = async (m, { conn, args, usedPrefix, command }) =>
  configurarAntiSimple(m, conn, {
    args, usedPrefix, command, dbKey: 'antiAudio', nombre: 'Anti-audio',
  })

handler.command = ['antiaudio']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
