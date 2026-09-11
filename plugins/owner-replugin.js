import fs from 'fs'
import { join } from 'path'

let handler = async (m, { conn, args, usedPrefix, command, isOwner }) => {
  if (!isOwner) {
    return m.reply('*[❗] Solo los dueños pueden usar este comando.*')
  }

  
  if (!args[0]) {
    try {
      const dirPlugins = './plugins'
      const archivos = fs.readdirSync(dirPlugins)
      const archivosJs = archivos.filter(file => file.endsWith('.js'))
      
      if (archivosJs.length === 0) {
        return m.reply('*[❗] No se encontraron plugins en el directorio.*')
      }

      let texto = `📁 𝗣𝗹𝘂𝗴𝗶𝗻𝘀 𝗱𝗶𝘀𝗽𝗼𝗻𝗶𝗯𝗹𝗲𝘀\n\n`
      texto += `\n`
      
      archivosJs.forEach((file, index) => {
        const rutaArchivo = join(dirPlugins, file)
        const estadisticas = fs.statSync(rutaArchivo)
        const tamano = (estadisticas.size / 1024).toFixed(2) 
        
        texto += `*${index + 1}.* ${file}\n`
        texto += `> • Tamaño: ${tamano} KB\n`
        if (index < archivosJs.length - 1) texto += `│\n`
      })
      
      texto += `\n`
      texto += `> *Total:* ${archivosJs.length} plugins\n`
      texto += `> *Para reemplazar:* ${usedPrefix}replugin <nombre.js>`

      await conn.sendMessage(m.chat, {
        text: texto,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })

    } catch (error) {
      console.error('Error listando plugins:', error)
      m.reply('*[❗] Error al listar los plugins.*')
    }
    return
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
    return m.reply(`*[❗] El archivo ${nombreArchivo} no existe.*\n\nUsa ${usedPrefix}replugin para ver todos los plugins disponibles.`)
  }

  
  if (!m.quoted || !m.quoted.text) {
    return m.reply(`*[❗] Debes responder a un mensaje con el nuevo código del plugin.*

*Ejemplo:*
1. Escribe: ${usedPrefix}replugin ${nombreArchivo}
2. Responde a este mensaje con el código completo del nuevo plugin`)
  }

  let contenidoPluginNuevo = m.quoted.text

  try {
    
    const rutaBackup = rutaPlugin + '.backup'
    if (!fs.existsSync(rutaBackup)) {
      fs.copyFileSync(rutaPlugin, rutaBackup)
    }

    
    fs.writeFileSync(rutaPlugin, contenidoPluginNuevo, 'utf8')
    
    let texto = `✅ 𝗣𝗹𝘂𝗴𝗶𝗻 𝗿𝗲𝗺𝗽𝗹𝗮𝘇𝗮𝗱𝗼 \n\n> *Archivo:* ${nombreArchivo}\n> *Ruta:* plugins/${nombreArchivo}\n> *Backup:* ${nombreArchivo}.backup\n> *Comando:* .${nombreArchivo.replace('.js', '')}`

    await conn.sendMessage(m.chat, {
      text: texto,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })

  } catch (error) {
    console.error('Error reemplazando plugin:', error)
    m.reply(`*[❗] Error al reemplazar el plugin: ${error.message}*`)
  }
}

handler.help = ['#replugin\n→ Listar todos los plugins', '#replugin <nombre.js>\n→ Reemplazar un plugin (responde con el código)']
handler.tags = ['owner']
handler.command = ['replugin', 'replaceplugin', 'reemplazarplugin']

export default handler 