import fs from 'fs'
import path from 'path'
import { join } from 'path'

let handler = async (m, { conn, usedPrefix, command, text, args }) => {
  const botActual = conn.user?.jid?.split('@')[0].replace(/\D/g, '')
  const configPath = join('./Serbot', botActual, 'config.json')

  let nombreBot = global.namebot || 'PAIN BOT'

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config.name) nombreBot = config.name
    } catch (err) {}
  }

  const senderNumber = m.sender.replace(/[^0-9]/g, '')
  const botPath = path.join('./Serbot', senderNumber)

  if (!fs.existsSync(botPath)) {
    return conn.reply(m.chat, `¿Hola, cómo te va?\n\n* No encontré una sesión activa vinculada a tu número\n\n* Puede que aún no te hayas conectado\n\n* Si deseas iniciar una nueva, estaré aquí para ayudarte\n\n`, m, rcanal)
  }

  const configPathUser = path.join(botPath, 'config.json')
  let config = {}

  if (fs.existsSync(configPathUser)) {
    try {
      config = JSON.parse(fs.readFileSync(configPathUser))
    } catch {}
  }

  
  if (!text) {
    const autoReadStatus = config.autoRead !== false ? 'Activado ✅' : 'Desactivado ❌'
    return conn.reply(m.chat, `📖 𝗔𝘂𝘁𝗼-𝗟𝗲𝗲𝗿

> *Estado actual:* ${autoReadStatus}
*Comandos disponibles:*
> *.setautoread on* - Activar auto-leer
> *.setautoread off* - Desactivar auto-leer

*¿Qué hace el auto-leer?*
✧ Marca automáticamente los mensajes como leídos
✧ Aparece el doble check azul en WhatsApp`, m, rcanal)
  }

  const action = text.toLowerCase().trim()

  if (action === 'on' || action === 'activar' || action === 'enable') {
    config.autoRead = true
    await conn.reply(m.chat, `✅ 𝗔𝘂𝘁𝗼-𝗟𝗲𝗲𝗿 𝗮𝗰𝘁𝗶𝘃𝗮𝗱𝗼*`, m, rcanal)
  } else if (action === 'off' || action === 'desactivar' || action === 'disable') {
    config.autoRead = false
    await conn.reply(m.chat, `❌ 𝗔𝘂𝘁𝗼-𝗟𝗲𝗲𝗿 𝗱𝗲𝘀𝗮𝗰𝘁𝗶𝘃𝗮𝗱𝗼`, m, rcanal)
  } else {
    return conn.reply(m.chat, `❗ 𝗨𝘀𝗼 𝗶𝗻𝗰𝗼𝗿𝗿𝗲𝗰𝘁𝗼

 *Comandos válidos:*
> *.setautoread on* - Activar
> *.setautoread off* - Desactivar
> *.setautoread* - Ver estado actual`, m, rcanal)
  }

  try {
    fs.writeFileSync(configPathUser, JSON.stringify(config, null, 2))
  } catch (error) {
    console.error('Error guardando configuración de auto-leer:', error)
    await conn.reply(m.chat, `❌ Error al guardar la configuración. Inténtalo nuevamente.`, m, rcanal)
  }
}

handler.help = ['setautoread <on/off>']
handler.tags = ['serbot']
handler.command = ['setautoread']

export default handler 