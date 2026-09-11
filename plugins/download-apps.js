import axios from 'axios'
import fs from 'fs'
import path from 'path'

let handler = async (m, { conn, text, args, usedPrefix, command }) => {
  if (!text) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Ingresa el nombre de la aplicación que deseas descargar.
      
> Ejemplo: ${usedPrefix}apk Whatsapp`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }

  const consulta = text.trim()
  
  try {

  
    const urlApi = `https://bytebazz-api.koyeb.app/api/download/aptoide?query=${encodeURIComponent(consulta)}&apikey=8jkh5icbf05`
    const { datos } = await axios.get(urlApi)

    if (!datos.status) {
      await conn.sendMessage(m.chat, {
        text: `[❗] No se encontró la aplicación intenta con otro nombre.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
      return
    }

    const datosApp = datos.data

    
    const infoApp = `𓂃 ࣪ ִֶָ☾. Nombre: ${datosApp.name}
𓂃 ࣪ ִֶָ☾. Paquete: ${datosApp.package}
𓂃 ࣪ ִֶָ☾. Tamaño: ${datosApp.size}
𓂃 ࣪ ִֶָ☾. Actualizado: ${datosApp.lastup}`

    
    try {
      const respuestaApk = await axios.get(datosApp.dllink, { responseType: 'arraybuffer' })
      const buferApk = Buffer.from(respuestaApk.data)
      
      
      await conn.sendMessage(m.chat, {
        document: buferApk,
        fileName: `${datosApp.name}.apk`,
        mimetype: 'application/vnd.android.package-archive',
        caption: infoApp,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
      
    } catch (errorApk) {
      console.error('Error descargando APK:', errorApk)
      
    
      const infoReserva = `𓂃 ࣪ ִֶָ☾. Nombre: ${datosApp.name}
𓂃 ࣪ ִֶָ☾. Paquete: ${datosApp.package}
𓂃 ࣪ ִֶָ☾. Tamaño: ${datosApp.size}
𓂃 ࣪ ִֶָ☾. Actualizado: ${datosApp.lastup}
𓂃 ࣪ ִֶָ☾. Enlace de descarga: ${datosApp.dllink}`

      await conn.sendMessage(m.chat, {
        text: infoReserva,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

  } catch (error) {
    console.error('Error en comando download-apps:', error)
    
    await conn.sendMessage(m.chat, {
      text: `[❌] Error al buscar la aplicación intenta nuevamente más tarde.`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.command = ['aptoide', 'descargar', 'apk']

export default handler