
let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    
    if (!args[0]) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Uso incorrecto.\n> *Ejemplo:* ${usedPrefix}${command} 8.8.8.8`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    const direccionIp = args[0].trim()


    const regexIp = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
    if (!regexIp.test(direccionIp)) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Formato de IP inválido. Use una dirección IP válida.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    const respuestaIp = await fetch(`http://ipwhois.app/json/${direccionIp}`)
    const datosIp = await respuestaIp.json()

    if (datosIp.success === false) {
      return conn.sendMessage(m.chat, {
        text: `[❌] Error al consultar la IP: ${datosIp.message || 'IP no encontrada'}`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    let textoInfo = `𝗜𝗡𝗙𝗢 𝗜𝗣\n\n`
    textoInfo += `> *IP:* ${datosIp.ip}\n`
    textoInfo += `> *Tipo:* ${datosIp.type || 'Desconocido'}\n`
    textoInfo += `> *Continente:* ${datosIp.continent || 'Desconocido'}\n`
    textoInfo += `> *País:* ${datosIp.country || 'Desconocido'} (${datosIp.country_code || ''})\n`
    textoInfo += `> *Región:* ${datosIp.region || 'Desconocido'}\n`
    textoInfo += `> *Ciudad:* ${datosIp.city || 'Desconocida'}\n`
    textoInfo += `> *Código Postal:* ${datosIp.zip || 'Desconocido'}\n`
    textoInfo += `> *Latitud:* ${datosIp.latitude}\n`
    textoInfo += `> *Longitud:* ${datosIp.longitude}\n`
    textoInfo += `> *Zona Horaria:* ${datosIp.timezone || 'Desconocida'}\n`
    textoInfo += `> *ISP:* ${datosIp.isp || 'Desconocido'}\n`
    textoInfo += `> *Organización:* ${datosIp.org || 'Desconocida'}\n`
    textoInfo += `> *ASN:* ${datosIp.asn || 'Desconocido'}\n`


    await conn.sendMessage(m.chat, {
      text: textoInfo,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })

    
    await conn.sendMessage(m.chat, {
      location: {
        degreesLatitude: parseFloat(datosIp.latitude),
        degreesLongitude: parseFloat(datosIp.longitude)
      }
    }, { quoted: m })

  } catch (error) {
    console.error('Error en comando IP:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al consultar la información de la IP.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['ip', 'ipinfo', 'ipwhois �? Consulta información detallada de una dirección IP con ubicación']
handler.tags = ['herramientas', 'utilidades']
handler.command = ['ip', 'ipinfo', 'ipwhois']

export default handler
