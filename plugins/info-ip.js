
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

    const ipAddress = args[0].trim()


    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
    if (!ipRegex.test(ipAddress)) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Formato de IP inválido. Use una dirección IP válida.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    const ipResponse = await fetch(`http://ipwhois.app/json/${ipAddress}`)
    const ipData = await ipResponse.json()

    if (ipData.success === false) {
      return conn.sendMessage(m.chat, {
        text: `[❌] Error al consultar la IP: ${ipData.message || 'IP no encontrada'}`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    let infoText = `𝗜𝗡𝗙𝗢 𝗜𝗣\n\n`
    infoText += `> *IP:* ${ipData.ip}\n`
    infoText += `> *Tipo:* ${ipData.type || 'Desconocido'}\n`
    infoText += `> *Continente:* ${ipData.continent || 'Desconocido'}\n`
    infoText += `> *País:* ${ipData.country || 'Desconocido'} (${ipData.country_code || ''})\n`
    infoText += `> *Región:* ${ipData.region || 'Desconocido'}\n`
    infoText += `> *Ciudad:* ${ipData.city || 'Desconocida'}\n`
    infoText += `> *Código Postal:* ${ipData.zip || 'Desconocido'}\n`
    infoText += `> *Latitud:* ${ipData.latitude}\n`
    infoText += `> *Longitud:* ${ipData.longitude}\n`
    infoText += `> *Zona Horaria:* ${ipData.timezone || 'Desconocida'}\n`
    infoText += `> *ISP:* ${ipData.isp || 'Desconocido'}\n`
    infoText += `> *Organización:* ${ipData.org || 'Desconocida'}\n`
    infoText += `> *ASN:* ${ipData.asn || 'Desconocido'}\n`


    await conn.sendMessage(m.chat, {
      text: infoText,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })

    
    await conn.sendMessage(m.chat, {
      location: {
        degreesLatitude: parseFloat(ipData.latitude),
        degreesLongitude: parseFloat(ipData.longitude)
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
