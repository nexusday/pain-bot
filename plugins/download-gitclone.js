import fetch from 'node-fetch'

let regex = /(?:https|git)(?::\/\/|@)github\.com[\/:]([^\/:]+)\/(.+)/i
let handler = async (m, { conn, args, usedPrefix, command }) => {
  if (!args[0]) {
    return m.reply(`*[❗] Escribe la URL de un repositorio de GitHub que deseas descargar.*\n\n> Ejemplo: ${usedPrefix + command} https://github.com/usuario/repositorio`)
  }
  
  if (!regex.test(args[0])) {
    return m.reply(`[❗] Verifica que la URL sea de GitHub\n\n> Ejemplo: ${usedPrefix + command} https://github.com/usuario/repositorio`)
  }
  
  try {
    let [_, usuario, repositorio] = args[0].match(regex) || []
    let repoLimpio = repositorio.replace(/.git$/, '')
    let urlRepo = `https://api.github.com/repos/${usuario}/${repoLimpio}`
    let urlZip = `https://api.github.com/repos/${usuario}/${repoLimpio}/zipball`
    
    
    let [respuestaRepo, respuestaZip] = await Promise.all([
      fetch(urlRepo),
      fetch(urlZip),
    ])
    
    if (!respuestaRepo.ok) {
      return m.reply(`[❌] Error: No se pudo acceder al repositorio.\n\n> Verifica que el repositorio exista y sea público.`)
    }
    
    if (!respuestaZip.ok) {
      return m.reply(`[❌] Error: No se pudo descargar el archivo ZIP.\n\n> El repositorio podría ser privado o muy grande.`)
    }
    
    let datosRepo = await respuestaRepo.json()
    let disposicionContenido = respuestaZip.headers.get('content-disposition')
    let nombreArchivo = 'repository.zip'
    
    if (disposicionContenido) {
      const coincidencia = disposicionContenido.match(/attachment; filename=(.*)/)
      if (coincidencia) {
        nombreArchivo = coincidencia[1]
      }
    }
    
    let txt = ` ִֶָ☾. Github Download 

𓂃 ࣪ ִֶָ☾. *Nombre:* ${nombreArchivo}
𓂃 ࣪ ִֶָ☾. *Repositorio:* ${usuario}/${repoLimpio}
𓂃 ࣪ ִֶָ☾. *Creador:* ${datosRepo.owner.login}
𓂃 ࣪ ִֶָ☾. *Descripción:* ${datosRepo.description || 'Sin descripción disponible'}
𓂃 ࣪ ִֶָ☾. *URL:* ${args[0]}`
   
    const respuestaImg = await fetch('https://files.catbox.moe/t8ampx.jpg')
    const buferImg = await respuestaImg.buffer()
    
    await conn.sendMessage(m.chat, {
      image: buferImg,
      caption: txt,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
    
    
    const buferZip = await respuestaZip.buffer()
    await conn.sendMessage(m.chat, {
      document: buferZip,
      fileName: nombreArchivo,
      mimetype: 'application/zip',
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
    
  } catch (error) {
    console.error('Error en gitclone:', error)
    m.reply(`*[❌] Ocurrió un error al procesar el repositorio.*\n\n> Error: ${error.message}`)
  }
}
handler.command = ['git']
export default handler