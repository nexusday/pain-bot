import fs from 'fs'
import path from 'path'
import { join } from 'path'

let handler = async (m, { conn, usedPrefix, command, text, args }) => {
  const botActual = conn.user?.jid?.split('@')[0].replace(/\D/g, '')
  const rutaConfig = join('./Serbot', botActual, 'config.json')

  let nombreBot = global.namebot || 'PAIN BOT'

  if (fs.existsSync(rutaConfig)) {
    try {
      const configuracion = JSON.parse(fs.readFileSync(rutaConfig, 'utf-8'))
      if (configuracion.name) nombreBot = configuracion.name
    } catch (err) {}
  }

  const numeroRemitente = m.sender.replace(/[^0-9]/g, '')
  const rutaBot = path.join('./Serbot', numeroRemitente)

  if (!fs.existsSync(rutaBot)) {
    return conn.reply(m.chat, `¿Hola, cómo te va?\n\n* No encontré una sesión activa vinculada a tu número\n\n* Puede que aún no te hayas conectado\n\n* Si deseas iniciar una nueva, estaré aquí para ayudarte\n\n`, m, rcanal)
  }

  const rutaConfigUsuario = path.join(rutaBot, 'config.json')
  let configuracion = {}

  if (fs.existsSync(rutaConfigUsuario)) {
    try {
      configuracion = JSON.parse(fs.readFileSync(rutaConfigUsuario))
    } catch {}
  }

  
  if (!text) {
    const estadoAutoLeer = configuracion.autoRead !== false ? 'Activado ✅' : 'Desactivado ❌'
    return conn.reply(m.chat, `📖 𝗔𝘂𝘁𝗼-𝗟𝗲𝗲𝗿

> *Estado actual:* ${estadoAutoLeer}
*Comandos disponibles:*
> *.setautoread on* - Activar auto-leer
> *.setautoread off* - Desactivar auto-leer

*¿Qué hace el auto-leer?*
✧ Marca automáticamente los mensajes como leídos
✧ Aparece el doble check azul en WhatsApp`, m, rcanal)
  }

  const accion = text.toLowerCase().trim()

  if (accion === 'on' || accion === 'activar' || accion === 'enable') {
    configuracion.autoRead = true
    await conn.reply(m.chat, `✅ 𝗔𝘂𝘁𝗼-𝗟𝗲𝗲𝗿 𝗮𝗰𝘁𝗶𝘃𝗮𝗱𝗼*`, m, rcanal)
  } else if (accion === 'off' || accion === 'desactivar' || accion === 'disable') {
    configuracion.autoRead = false
    await conn.reply(m.chat, `❌ 𝗔𝘂𝘁𝗼-𝗟𝗲𝗲𝗿 𝗱𝗲𝘀𝗮𝗰𝘁𝗶𝘃𝗮𝗱𝗼`, m, rcanal)
  } else {
    return conn.reply(m.chat, `❗ 𝗨𝘀𝗼 𝗶𝗻𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗼

 *Comandos válidos:*
> *.setautoread on* - Activar
> *.setautoread off* - Desactivar
> *.setautoread* - Ver estado actual`, m, rcanal)
  }

  try {
    fs.writeFileSync(rutaConfigUsuario, JSON.stringify(configuracion, null, 2))
  } catch (error) {
    console.error('Error guardando configuración de auto-leer:', error)
    await conn.reply(m.chat, `❌ Error al guardar la configuración. Inténtalo nuevamente.`, m, rcanal)
  }
}

handler.help = ['setautoread <on/off>']
handler.tags = ['serbot']
handler.command = ['setautoread']

export default handler 