import fs from 'fs'
import { join } from 'path'

let handler = async (m, { conn, args, usedPrefix, command, isOwner }) => {
  if (!isOwner) {
    return m.reply('*[❗] Solo los dueños pueden usar este comando.*')
  }

  if (!args[0]) {
    return m.reply(`*[❗] Uso correcto:*
${usedPrefix}plugin <nombre_archivo.js>

*Ejemplo:*
1. Escribe: ${usedPrefix}plugin mi-comando.js
2. Responde a este mensaje con el código completo del plugin`)
  }

  let nombreArchivo = args[0]
  
  
  if (!nombreArchivo.endsWith('.js')) {
    nombreArchivo += '.js'
  }

 
  if (!/^[a-zA-Z0-9-_]+\.js$/.test(nombreArchivo)) {
    return m.reply('*[❗] Nombre de archivo inválido. Solo letras, números, guiones y guiones bajos.*')
  }

  const rutaPlugin = join('./plugins', nombreArchivo)

  
  if (fs.existsSync(rutaPlugin)) {
    return m.reply(`*[❗] El archivo ${nombreArchivo} ya existe.*`)
  }

 
  if (!m.quoted || !m.quoted.text) {
    return m.reply(`*[❗] Debes responder a un mensaje con el código del plugin.*

*Ejemplo:*
1. Escribe: ${usedPrefix}plugin mi-comando.js
2. Responde a este mensaje con el código completo`)
  }

  let contenidoPlugin = m.quoted.text

  try {
    
    fs.writeFileSync(rutaPlugin, contenidoPlugin, 'utf8')
    
    let texto = `✅ 𝗣𝗹𝘂𝗴𝗶𝗻 𝗰𝗿𝗲𝗮𝗱𝗼\n\n> *Archivo:* ${nombreArchivo}\n> *Ruta:* plugins/${nombreArchivo}\n> *Comando:* .${nombreArchivo.replace('.js', '')}\n`

    await conn.sendMessage(m.chat, {
      text: texto,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })

  } catch (error) {
    console.error('Error creando plugin:', error)
    m.reply(`*[❗] Error al crear el plugin: ${error.message}*`)
  }
}

handler.help = ['#plugin <nombre.js>\n→ Crear un nuevo plugin (responde con el código)']
handler.tags = ['owner']
handler.command = ['plugin', 'addplugin', 'crearplugin']

export default handler 