import fs from 'fs'
import { join } from 'path'

let handler = async (m, { conn, args, usedPrefix, command, isOwner }) => {
  if (!isOwner) {
    return m.reply('*[❗] Solo los dueños pueden usar este comando.*')
  }

  if (!args[0]) {
    return m.reply(`*[❗] Uso correcto:*
${usedPrefix}verplugin <nombre_archivo.js>

*Ejemplo:*
${usedPrefix}verplugin play.js`)
  }

  let nombreArchivo = args[0]
  
  
  if (!nombreArchivo.endsWith('.js')) {
    nombreArchivo += '.js'
  }

 
  if (!/^[a-zA-Z0-9-_]+\.js$/.test(nombreArchivo)) {
    return m.reply('*[❗] Nombre de archivo inválido. Solo letras, números, guiones y guiones bajos.*')
  }

  const rutaPlugin = join('./plugins', nombreArchivo)

 
  if (!fs.existsSync(rutaPlugin)) {
    return m.reply(`*[❗] El archivo ${nombreArchivo} no existe.*`)
  }

  try {
    
    const contenidoPlugin = fs.readFileSync(rutaPlugin, 'utf8')
    
   
    await conn.sendMessage(m.chat, {
      text: contenidoPlugin
    }, { quoted: m })

  } catch (error) {
    console.error('Error leyendo plugin:', error)
    m.reply(`*[❗] Error al leer el plugin: ${error.message}*`)
  }
}

handler.help = ['#verplugin <nombre.js>\n→ Ver el código de un plugin']
handler.tags = ['owner']
handler.command = ['verplugin', 'viewplugin', 'verplugin']

export default handler 