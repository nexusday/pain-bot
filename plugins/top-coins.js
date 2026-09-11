let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
       
     const todosUsuarios = Object.entries(global.db.data.users)
       .filter(([jid, usuario]) => usuario && typeof usuario.coins === 'number')
       .map(([jid, usuario]) => ({
         jid: jid,
         coins: (usuario.coins || 0) + (usuario.bancoDinero || 0), 
         name: usuario.name || 'Usuario'
       }))
      .filter(usuario => usuario.coins > 0) 
      .sort((a, b) => b.coins - a.coins) 
      .slice(0, 10) 

    if (todosUsuarios.length === 0) {
      return conn.sendMessage(m.chat, {
        text: `[❗] No hay usuarios con ${global.moneda} registrados.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    
    let texto = `💰 𝗧𝗼𝗽 𝗴𝗹𝗼𝗯𝗮𝗹𝗲𝘀 \n\n`

    
    todosUsuarios.forEach((usuario, indice) => {
      const posicion = indice + 1
      let emoji = ''
      
      
      switch (posicion) {
        case 1: emoji = '🥇'; break
        case 2: emoji = '🥈'; break
        case 3: emoji = '🥉'; break
        default: emoji = '💰'; break
      }
      
      texto += `  𓂃 ࣪ ִֶָ☾. *${posicion}.* ${usuario.name}\n`
      texto += `  𓂃 ࣪ ִֶָ☾. *${global.moneda}:* ${usuario.coins.toLocaleString()}\n\n`
    })

    return conn.sendMessage(m.chat, {
      text: texto,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })

  } catch (error) {
    console.error('Error en top coins:', error)
    return conn.sendMessage(m.chat, {
      text: `[❌] Ocurrió un error al generar el top de ${global.moneda}.`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = [`#topcoins\n→ Muestra el top 10 global de usuarios con más ${global.moneda}`]
handler.tags = ['juegos', 'economía']
handler.command = ['topcoins', 'topcoin', 'top-coins', 'richest', 'ricos']

export default handler 