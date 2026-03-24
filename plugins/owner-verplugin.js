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

  let fileName = args[0]
  
  
  if (!fileName.endsWith('.js')) {
    fileName += '.js'
  }

 
  if (!/^[a-zA-Z0-9-_]+\.js$/.test(fileName)) {
    return m.reply('*[❗] Nombre de archivo inválido. Solo letras, números, guiones y guiones bajos.*')
  }

  const pluginPath = join('./plugins', fileName)

 
  if (!fs.existsSync(pluginPath)) {
    return m.reply(`*[❗] El archivo ${fileName} no existe.*`)
  }

  try {
    
    const pluginContent = fs.readFileSync(pluginPath, 'utf8')
    
   
    await conn.sendMessage(m.chat, {
      text: pluginContent
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