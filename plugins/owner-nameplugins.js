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

      let texto = `📁 𝗣𝗹𝘂𝗴𝗶𝗻𝘀 𝗱𝗶𝘀𝗽𝗼𝗻𝗶𝗯𝗹𝗲𝘀\n`
      texto += `\n`
      
      archivosJs.forEach((file, index) => {
        const rutaArchivo = join(dirPlugins, file)
        const estadisticas = fs.statSync(rutaArchivo)
        const tamano = (estadisticas.size / 1024).toFixed(2) 
        
        texto += ` *${index + 1}.* ${file}\n`
        texto += `> • Tamaño: ${tamano} KB\n`
        if (index < archivosJs.length - 1) texto += `\n`
      })
      
      texto += `\n`
      texto += `> *Total:* ${archivosJs.length} plugins\n`
      texto += `> *Para renombrar:* ${usedPrefix}nameplugins archivo.js > nuevonombre.js\n`

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

  
  let entrada = args.join(' ')
  
 
  if (!entrada.includes('>')) {
    return m.reply(`*[❗] Uso correcto:*
${usedPrefix}nameplugins archivo.js > nuevonombre.js

*Ejemplo:*
${usedPrefix}nameplugins test.js > nuevo-test.js`)
  }

  
  let partes = entrada.split('>')
  if (partes.length !== 2) {
    return m.reply('*[❗] Formato inválido. Usa: archivo.js > nuevonombre.js*')
  }

  let nombreArchivoAnterior = partes[0].trim()
  let nuevoNombreArchivo = partes[1].trim()

  
  if (!nombreArchivoAnterior.endsWith('.js')) {
    nombreArchivoAnterior += '.js'
  }
  if (!nuevoNombreArchivo.endsWith('.js')) {
    nuevoNombreArchivo += '.js'
  }

  
  if (!/^[a-zA-Z0-9-_]+\.js$/.test(nombreArchivoAnterior)) {
    return m.reply('*[❗] Nombre del archivo original inválido. Solo letras, números, guiones y guiones bajos.*')
  }
  if (!/^[a-zA-Z0-9-_]+\.js$/.test(nuevoNombreArchivo)) {
    return m.reply('*[❗] Nuevo nombre de archivo inválido. Solo letras, números, guiones y guiones bajos.*')
  }

  const rutaAnterior = join('./plugins', nombreArchivoAnterior)
  const rutaNueva = join('./plugins', nuevoNombreArchivo)

  
  if (!fs.existsSync(rutaAnterior)) {
    return m.reply(`*[❗] El archivo ${nombreArchivoAnterior} no existe.*\n\nUsa ${usedPrefix}nameplugins para ver todos los plugins disponibles.`)
  }

  
  if (fs.existsSync(rutaNueva)) {
    return m.reply(`*[❗] El archivo ${nuevoNombreArchivo} ya existe.*`)
  }

  try {
   
    fs.renameSync(rutaAnterior, rutaNueva)
    
    let texto = `✅ 𝗣𝗹𝘂𝗴𝗶𝗻 𝗿𝗲𝗻𝗼𝗺𝗯𝗿𝗮𝗱𝗼\n\n> *Archivo original:* ${nombreArchivoAnterior}\n> *Nuevo nombre:* ${nuevoNombreArchivo}\n> *Comando anterior:* .${nombreArchivoAnterior.replace('.js', '')}\n> *Nuevo comando:* .${nuevoNombreArchivo.replace('.js', '')}`

    await conn.sendMessage(m.chat, {
      text: texto,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })

  } catch (error) {
    console.error('Error renombrando plugin:', error)
    m.reply(`*[❗] Error al renombrar el plugin: ${error.message}*`)
  }
}

handler.help = ['#nameplugins\n→ Listar todos los plugins', '#nameplugins archivo.js > nuevonombre.js\n→ Renombrar un plugin']
handler.tags = ['owner']
handler.command = ['nameplugins', 'renameplugin', 'renombrarplugin']

export default handler 