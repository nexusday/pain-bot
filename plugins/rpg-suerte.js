
const cooldownTime = 5 * 60 * 1000

const situacionesSuerte = [
  { descripcion: 'Encontraste una moneda de oro en la calle y la vendiste', recompensa: [500, 800] },
  { descripcion: 'Ganaste la lotería local con un boleto olvidado', recompensa: [700, 1200] },
  { descripcion: 'Un turista te dio una propina exagerada por ayudar', recompensa: [600, 1000] },
  { descripcion: 'Encontraste una billetera con dinero y el dueño te recompensó', recompensa: [800, 1300] },
  { descripcion: 'Herenciaste una pequeña fortuna de un familiar lejano', recompensa: [900, 1500] },
  { descripcion: 'Vendiste un objeto viejo que resultó ser valioso', recompensa: [650, 1100] },
  { descripcion: 'Ganaste un concurso de redes sociales', recompensa: [750, 1250] },
  { descripcion: 'Encontraste trabajo freelance bien pagado', recompensa: [850, 1400] },
  { descripcion: 'Un amigo te devolvió una deuda olvidada', recompensa: [700, 1150] },
  { descripcion: 'Recibiste un bono sorpresa en tu trabajo', recompensa: [780, 1300] },
  { descripcion: 'Vendiste fotos tuyas a una revista', recompensa: [550, 950] },
  { descripcion: 'Ganaste un sorteo en una tienda', recompensa: [620, 1050] },
  { descripcion: 'Encontraste monedas antiguas en una casa vieja', recompensa: [670, 1100] },
  { descripcion: 'Un inversionista notó tu talento y te financió', recompensa: [1200, 2000] },
  { descripcion: 'Descubriste que tenías acciones olvidadas', recompensa: [1000, 1800] },
  { descripcion: 'Ganaste un premio por ser buen ciudadano', recompensa: [720, 1200] },
  { descripcion: 'Un conocido te regaló entradas para un evento VIP', recompensa: [770, 1250] },
  { descripcion: 'Encontraste un tesoro escondido en el jardín', recompensa: [820, 1350] },
  { descripcion: 'Tu video viralizó y monetizaste', recompensa: [1100, 1900] },
  { descripcion: 'Ganaste una beca inesperada', recompensa: [870, 1450] },
  { descripcion: 'Un cliente satisfecho te dio una gratificación extra', recompensa: [790, 1300] },
  { descripcion: 'Descubriste criptomonedas olvidadas', recompensa: [1150, 1950] },
  { descripcion: 'Ganaste un viaje pagado por un concurso', recompensa: [920, 1550] },
  { descripcion: 'Encontraste diamantes en una mina abandonada', recompensa: [1400, 2300] },
  { descripcion: 'Un famoso te mencionó en sus redes', recompensa: [1050, 1800] },
  { descripcion: 'Herenciaste una colección de arte valiosa', recompensa: [1300, 2200] },
  { descripcion: 'Ganaste derechos de autor por una canción tuya', recompensa: [1120, 1900] },
  { descripcion: 'Un millonario te adoptó como ahijado', recompensa: [1600, 2500] },
  { descripcion: 'Descubriste petróleo en tus tierras', recompensa: [1800, 2500] },
  { descripcion: 'Ganaste el premio mayor de una rifa', recompensa: [1200, 2100] }
]

let handler = async (m, { conn, usedPrefix, command }) => {
  try {

    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo puede ser usado en grupos.',
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }


    let user = global.db.data.users[m.sender]
    if (!user) {
      global.db.data.users[m.sender] = {
        coins: 100,
        exp: 0,
        level: 0,
        registered: true,
        name: m.name || m.pushName || 'Usuario'
      }
      user = global.db.data.users[m.sender]
    }

    if (!user.lastLuck) user.lastLuck = 0
    const timeSinceLastLuck = Date.now() - user.lastLuck

    if (timeSinceLastLuck < cooldownTime) {
      const minutes = Math.ceil((cooldownTime - timeSinceLastLuck) / 60000)
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes esperar *${minutes} minuto${minutes !== 1 ? 's' : ''}* para probar suerte de nuevo.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    user.lastLuck = Date.now()


    const situacionSeleccionada = situacionesSuerte[Math.floor(Math.random() * situacionesSuerte.length)]

    
    const [min, max] = situacionSeleccionada.recompensa
    const recompensa = Math.floor(Math.random() * (max - min + 1)) + min
    user.coins += recompensa

    
    const mensajesFelicitacion = [
      '¡Qué fortuna tienes!',
      '¡La suerte te sonríe!',
      '¡Eres un afortunado!',
      '¡Bendecido por la suerte!',
      '¡Increíble suerte!',
      '¡La fortuna te acompaña!',
      '¡Qué buena fortuna!',
      '¡Suerte extraordinaria!',
    ]

    const mensajeFelicitacion = mensajesFelicitacion[Math.floor(Math.random() * mensajesFelicitacion.length)]

    let txt = `🧿 𝗧𝘂 𝘀𝘂𝗲𝗿𝘁𝗲\n\n> Situación: ${situacionSeleccionada.descripcion}\n> Recompensa: +${recompensa} ${global.moneda}\n> Total: ${user.coins} ${global.moneda}\n> Próxima suerte: 5 min`

    return conn.sendMessage(m.chat, {
      text: txt,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })

  } catch (e) {
    console.error('Error en suerte:', e)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al probar suerte.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['suerte', 'luck', 'fortuna → Prueba suerte cada 5 min y gana 500-2500 USD']
handler.tags = ['juegos', 'economía', 'rpg']
handler.command = ['suerte', 'luck', 'fortuna']

export default handler
