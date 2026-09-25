const ENFRIAMIENTO_DIARIO = 24 * 60 * 60 * 1000
const BASE_DIARIO = 9000
const PASO_RACHA_DIARIO = 500

function obtenerPremioDiario(racha) {
  return BASE_DIARIO + (racha - 1) * PASO_RACHA_DIARIO
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    let usuario = global.db.data.users[m.sender]
    if (!usuario) global.db.data.users[m.sender] = {}

    usuario = global.db.data.users[m.sender]
    const monedas = usuario.coins || 0

    const ultimoDiario = usuario.lastDaily || 0
    const tiempoRestante = ENFRIAMIENTO_DIARIO - (Date.now() - ultimoDiario)

    if (tiempoRestante > 0) {
      const horas = Math.floor(tiempoRestante / 3600000)
      const minutos = Math.floor((tiempoRestante % 3600000) / 60000)
      const segundos = Math.floor((tiempoRestante % 60000) / 1000)
      const proximaRacha = (usuario.dailyStreak || 0) + 1

      return conn.sendMessage(m.chat, {
        text: `[❗] Ya reclamaste tu daily hoy.\n\n> *Tiempo restante:* ${horas}h ${minutos}m ${segundos}s\n> *Próxima racha:* ${proximaRacha}\n> *Próximo premio:* ${obtenerPremioDiario(proximaRacha).toLocaleString()} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    let racha = usuario.dailyStreak || 0
    let nota = ''

    const tiempoDesdeUltimoClaim = Date.now() - ultimoDiario
    if (ultimoDiario > 0 && tiempoDesdeUltimoClaim > ENFRIAMIENTO_DIARIO + 60000) {
      racha = 0
      nota = 'racha reiniciada'
    }

    if (racha === 0) {
      racha = 1
      if (!nota && ultimoDiario === 0) nota = 'primer daily'
    } else {
      racha++
    }

    const premio = obtenerPremioDiario(racha)
    const proximoPremio = obtenerPremioDiario(racha + 1)

    usuario.coins = monedas + premio
    usuario.dailyStreak = racha
    usuario.lastDaily = Date.now()

    const proximoClaim = new Date(Date.now() + ENFRIAMIENTO_DIARIO)
    const proximaFecha = proximoClaim.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })

    const texto = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *+${premio.toLocaleString()} ${global.moneda}*
╰─ ✧  ✩
┊ ${nota || `${racha} ${racha === 1 ? 'día' : 'días'}`}
┊ ahora  ·  \`${usuario.coins.toLocaleString()} ${global.moneda}\`
┊ mañana  ·  \`+${proximoPremio.toLocaleString()} ${global.moneda}\`
┊ vuelves  ·  \`${proximaFecha}\`
╰─────────`.trim()

    return conn.sendMessage(m.chat, {
      text: texto,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en daily:', error)
    return conn.sendMessage(m.chat, {
      text: '[❌] Ocurrió un error al reclamar el daily.',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['#daily • #day\n→ Reclama USD diarios con racha (9K +500/día)']
handler.tags = ['juegos', 'economía']
handler.command = ['daily', 'day', 'diario']

export default handler
