import axios from 'axios'

let handler = async (m, { conn, text, usedPrefix }) => {
  if (!text) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Ingresa el nombre de la aplicación que deseas descargar.\n\n> Ejemplo: ${usedPrefix}apk Whatsapp`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const consulta = text.trim()

  try {
    const base = (global.APIs?.delirius?.url || 'https://api.delirius.online').replace(/\/$/, '')
    const respuesta = await axios.get(`${base}/download/apk?query=${encodeURIComponent(consulta)}`)
    const cuerpo = respuesta.data

    if (!cuerpo?.status || !cuerpo?.data?.download) {
      return conn.sendMessage(m.chat, {
        text: `[❗] No se encontró la aplicación. Intenta con otro nombre.`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const app = cuerpo.data
    const infoApp = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${app.name}*
╰─ ✧  ✩
┊ paquete  ·  \`${app.id || '—'}\`
┊ tamaño  ·  \`${app.size || '—'}\`
┊ autor  ·  \`${app.developer || '—'}\`
┊ publicado  ·  \`${app.publish || '—'}\`
╰─────────`.trim()

    const nombre = String(app.name || 'app').replace(/[<>:"/\\|?*]/g, '').slice(0, 60) || 'app'
    const peso = Number(app.sizeByte) || 0
    const maximo = 100 * 1024 * 1024

    if (app.image) {
      try {
        const icono = (await conn.getFile(app.image)).data
        await conn.sendMessage(m.chat, {
          image: icono,
          caption: infoApp,
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m })
      } catch {}
    }

    if (peso > maximo) {
      return conn.sendMessage(m.chat, {
        text: `${infoApp}\n\n> El archivo pesa *${app.size || 'más de 100 MB'}*. Ábrelo desde este enlace:\n> ${app.download}`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    try {
      const archivo = await axios.get(app.download, {
        responseType: 'arraybuffer',
        timeout: 180000,
        maxContentLength: maximo,
        maxBodyLength: maximo,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      })
      await conn.sendMessage(m.chat, {
        document: Buffer.from(archivo.data),
        fileName: `${nombre}.apk`,
        mimetype: 'application/vnd.android.package-archive',
        caption: app.image ? '' : infoApp,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    } catch (errorApk) {
      console.error('Error enviando APK:', errorApk?.message || errorApk)
      await conn.sendMessage(m.chat, {
        text: `${infoApp}\n\n> No pude subir el APK al chat. Ábrelo aquí:\n> ${app.download}`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }
  } catch (error) {
    console.error('Error en comando download-apps:', error)
    await conn.sendMessage(m.chat, {
      text: `[❌] Error al buscar la aplicación. Intenta nuevamente más tarde.`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.command = ['aptoide', 'descargar', 'apk']

export default handler
