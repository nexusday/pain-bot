
let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    
    if (!args[0]) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Uso correcto:\n\n> *Ejemplo:* ${usedPrefix}${command} Ricardo`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    const query = args.join(' ').trim()
    if (query.length < 2) {
      return conn.sendMessage(m.chat, {
        text: '[❗] El nombre/apodo debe tener al menos 2 caracteres.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }


    let resultados = []
    const totalPlataformas = 12

    
    const buscarEnPlataforma = async (plataforma, url, descripcion, tipo = 'web') => {
      try {
        
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) 

        let encontrado = false
        let urlFinal = url

        if (tipo === 'github') {
          
          try {
            const apiUrl = `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=5`
            const response = await fetch(apiUrl, {
              signal: controller.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            })
            if (response.ok) {
              const data = await response.json()
              encontrado = data.total_count > 0
              if (encontrado && data.items && data.items.length > 0) {
                urlFinal = data.items[0].html_url
              }
            }
          } catch (error) {
            
            encontrado = false
          }
        } else {
         
          try {
            const response = await fetch(url, {
              method: 'HEAD',
              signal: controller.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            })
            encontrado = response.status === 200
          } catch (error) {
            encontrado = false
          }
        }

        clearTimeout(timeoutId)

        if (encontrado) {
          resultados.push({
            plataforma,
            url: urlFinal,
            descripcion,
            estado: 'Encontrado'
          })
        }
        return encontrado
      } catch (error) {
        return false
      }
    }

   
    await Promise.all([
      buscarEnPlataforma('GitHub', `https://github.com/${query.replace(/\s+/g, '')}`, 'Perfil de desarrollador', 'github'),
      buscarEnPlataforma('Instagram', `https://instagram.com/${query.replace(/\s+/g, '').toLowerCase()}`, 'Perfil de Instagram'),
      buscarEnPlataforma('Twitter/X', `https://twitter.com/${query.replace(/\s+/g, '')}`, 'Cuenta de Twitter/X'),
      buscarEnPlataforma('Reddit', `https://reddit.com/user/${query.replace(/\s+/g, '')}`, 'Usuario de Reddit'),
      buscarEnPlataforma('YouTube', `https://youtube.com/@${query.replace(/\s+/g, '').toLowerCase()}`, 'Canal de YouTube'),
      buscarEnPlataforma('TikTok', `https://tiktok.com/@${query.replace(/\s+/g, '').toLowerCase()}`, 'Perfil de TikTok'),
      buscarEnPlataforma('Twitch', `https://twitch.tv/${query.replace(/\s+/g, '').toLowerCase()}`, 'Canal de Twitch'),
      buscarEnPlataforma('Discord', `https://discord.com/users/${query.replace(/\s+/g, '')}`, 'Usuario de Discord'),
      buscarEnPlataforma('Roblox', `https://roblox.com/users/profile?username=${query.replace(/\s+/g, '')}`, 'Perfil de Roblox'),
      buscarEnPlataforma('Steam', `https://steamcommunity.com/id/${query.replace(/\s+/g, '')}`, 'Perfil de Steam'),
      buscarEnPlataforma('LinkedIn', `https://linkedin.com/in/${query.replace(/\s+/g, '').toLowerCase()}`, 'Perfil profesional'),
      buscarEnPlataforma('Facebook', `https://facebook.com/${query.replace(/\s+/g, '').toLowerCase()}`, 'Perfil de Facebook')
    ])

    
    let infoText = `🌴 𝗕𝗨𝗦𝗤𝗨𝗘𝗗𝗔 𝗨𝗦𝗘𝗥𝗦\n\n`
    infoText += `> *Búsqueda:* "${query}"\n`
    infoText += `> *Plataformas revisadas:* ${totalPlataformas}/${totalPlataformas}\n`
    infoText += `> *Resultados encontrados:* ${resultados.length}\n`
    infoText += `\n`

    if (resultados.length > 0) {
      infoText += `> *PERFILES ENCONTRADOS:*\n\n`
      resultados.forEach((resultado, index) => {
        infoText += `> *${index + 1}. ${resultado.plataforma}*\n`
        infoText += `> ${resultado.descripcion}\n`
        infoText += `> ${resultado.url}\n`
        if (index < resultados.length - 1) infoText += `\n`
      })
    } else {
      infoText += `> *NINGÚN PERFIL ENCONTRADO*\n`
      infoText += `> El usuario no parece tener perfiles públicos\n`
      infoText += `> en las plataformas revisadas.\n`
    }

    infoText += `\n`
    infoText += `> *Plataformas buscadas:*\n`
    infoText += `> • GitHub • Instagram • Twitter/X\n`
    infoText += `> • Reddit • YouTube • TikTok\n`
    infoText += `> • Twitch • Discord • Roblox\n`
    infoText += `> • Steam • LinkedIn • Facebook\n`

    await conn.sendMessage(m.chat, {
      text: infoText,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })

  } catch (error) {
    console.error('Error en comando Sherlock:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌]  Ocurrió un error durante la búsqueda.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['sherlock', 'osint', 'buscar', 'stalk → Busca perfiles en múltiples plataformas sociales']
handler.tags = ['herramientas', 'utilidades']
handler.command = ['sher', 'dx']

export default handler
