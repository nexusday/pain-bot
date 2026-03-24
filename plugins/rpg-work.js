
const cooldownTime = 5 * 60 * 1000 

const trabajos = [
  
  { tipo: 'positivo', descripcion: 'Ayudaste a una abuelita a cruzar la calle', recompensa: [600, 1200] },
  { tipo: 'positivo', descripcion: 'Encontraste una billetera perdida y la devolviste', recompensa: [800, 1600] },
  { tipo: 'positivo', descripcion: 'Trabajaste como mesero en un restaurante', recompensa: [700, 1400] },
  { tipo: 'positivo', descripcion: 'Reparaste la computadora de un vecino', recompensa: [900, 1800] },
  { tipo: 'positivo', descripcion: 'Diste clases particulares de matemáticas', recompensa: [1000, 2000] },
  { tipo: 'positivo', descripcion: 'Ayudaste a un turista perdido', recompensa: [650, 1300] },
  { tipo: 'positivo', descripcion: 'Vendiste artesanías en el mercado', recompensa: [750, 1500] },
  { tipo: 'positivo', descripcion: 'Trabajaste como niñero por unas horas', recompensa: [680, 1360] },
  { tipo: 'positivo', descripcion: 'Donaste sangre en el banco de sangre', recompensa: [800, 1600] },
  { tipo: 'positivo', descripcion: 'Ayudaste a un amigo con su mudanza', recompensa: [720, 1440] },
  { tipo: 'positivo', descripcion: 'Apoyaste a la comunidad LGTB+ en una marcha', recompensa: [600, 1200] },
  { tipo: 'positivo', descripcion: 'Trabajaste como voluntario en un refugio', recompensa: [850, 1700] },
  { tipo: 'positivo', descripcion: 'Encontraste trabajo como freelance', recompensa: [950, 1900] },
  { tipo: 'positivo', descripcion: 'Ayudaste en una campaña de reciclaje', recompensa: [550, 1100] },
  { tipo: 'positivo', descripcion: 'Distribuiste comida a personas sin hogar', recompensa: [650, 1300] },


  { tipo: 'negativo', descripcion: 'Te han atropellado mientras ayudabas a alguien, perdiste dinero en el hospital', perdida: [600, 1200] },
  { tipo: 'negativo', descripcion: 'Tu prima quiso tener sexo contigo pero le dijiste que eras chipi, perdiste la oportunidad de ganar', perdida: [200, 600] },
  { tipo: 'negativo', descripcion: 'Intentaste robar un banco pero te cacharon, multa pagada', perdida: [800, 1600] },
  { tipo: 'negativo', descripcion: 'Trabajaste en un casino y perdiste todo apostando', perdida: [700, 1400] },
  { tipo: 'negativo', descripcion: 'Intentaste ser influencer pero nadie te siguió, gastaste en equipo', perdida: [500, 1000] },
  { tipo: 'negativo', descripcion: 'Te caíste en un bache mientras corrías, gastos médicos', perdida: [400, 800] },
  { tipo: 'negativo', descripcion: 'Compraste criptomonedas en el pico máximo y perdiste todo', perdida: [1000, 2000] },
  { tipo: 'negativo', descripcion: 'Intentaste ser comediante pero nadie rió, perdiste en el local', perdida: [300, 600] },
  { tipo: 'negativo', descripcion: 'Prestaste dinero a un amigo que nunca te pagó', perdida: [550, 1100] },
  { tipo: 'negativo', descripcion: 'Trabajaste en delivery y se te cayó toda la comida', perdida: [350, 700] },
  { tipo: 'negativo', descripcion: 'Intentaste cultivar marihuana pero la policía la encontró', perdida: [1200, 2000] },
  { tipo: 'negativo', descripcion: 'Apostaste en la lotería y perdiste todo tu dinero', perdida: [650, 1300] },
  { tipo: 'negativo', descripcion: 'Te emborrachaste y perdiste la billetera', perdida: [250, 500] },
  { tipo: 'negativo', descripcion: 'Compraste un auto usado que resultó ser robado', perdida: [1500, 2000] },
  { tipo: 'negativo', descripcion: 'Intentaste ser youtuber pero tu video se viralizó por malo', perdida: [450, 900] }
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

    if (!user.lastWork) user.lastWork = 0
    const timeSinceLastWork = Date.now() - user.lastWork

    if (timeSinceLastWork < cooldownTime) {
      const minutes = Math.ceil((cooldownTime - timeSinceLastWork) / 60000)
      return conn.sendMessage(m.chat, {
        text: `[❗] Debes esperar *${minutes} minuto${minutes !== 1 ? 's' : ''}* para volver a trabajar.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

    user.lastWork = Date.now()


    const trabajoSeleccionado = trabajos[Math.floor(Math.random() * trabajos.length)]

    let resultado = ''
    let cantidad = 0
    let emoji = ''

    if (trabajoSeleccionado.tipo === 'positivo') {
      const [min, max] = trabajoSeleccionado.recompensa
      cantidad = Math.floor(Math.random() * (max - min + 1)) + min
      user.coins += cantidad
      resultado = `✅ Trabajo completado`
      emoji = '💼'
    } else {
      const [min, max] = trabajoSeleccionado.perdida
      cantidad = Math.floor(Math.random() * (max - min + 1)) + min
      user.coins -= cantidad
      resultado = `❌ Qué mala suerte`
      emoji = '💸'
    }

    
    let mensajeExtra = ''
    if (trabajoSeleccionado.tipo === 'positivo') {
      const mensajesPositivos = [
        '¡Sigue ayudando a los demás!',
        '¡Excelente trabajo!',
        '¡Eres un crack!',
        '¡La comunidad te lo agradece!',
        '¡Así se hace!'
      ]
      mensajeExtra = mensajesPositivos[Math.floor(Math.random() * mensajesPositivos.length)]
    } else {
      const mensajesNegativos = [
        '¡No te desanimes, sigue intentando!',
        '¡La próxima será mejor!',
        '¡Aprendiste una lección!',
        '¡Todo pasa por algo!',
        '¡Mañana será otro día!'
      ]
      mensajeExtra = mensajesNegativos[Math.floor(Math.random() * mensajesNegativos.length)]
    }

    let txt = `💼 𝗧𝗿𝗮𝗯𝗮𝗷𝗮𝘀𝘁𝗲 \n\n> *Trabajo:* ${trabajoSeleccionado.descripcion}\n> ${resultado}\n> *Resultado:* ${trabajoSeleccionado.tipo === 'positivo' ? '+' : '-'}${cantidad} ${global.moneda}\n> *Total:* ${user.coins} ${global.moneda}\n`

    return conn.sendMessage(m.chat, {
      text: txt,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })

  } catch (e) {
    console.error('Error en work:', e)
    return conn.sendMessage(m.chat, {
      text: `[❌] No tienes suficientes ${global.moneda}.\nTienes: ${user.coins || 0} ${global.moneda}`,
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
  }
}

handler.help = ['work', 'trabajar', 'trabajo → Trabaja cada 5 min y gana/pierde 550-2000 USD']
handler.tags = ['juegos', 'economía', 'rpg']
handler.command = ['work', 'trabajar', 'trabajo']

export default handler
