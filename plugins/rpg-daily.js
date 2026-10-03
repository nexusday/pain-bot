const ENFRIAMIENTO_DIARIO = 24 * 60 * 60 * 1000
const BASE_DIARIO = 9000
const PASO_RACHA_DIARIO = 500
const CLAIM_DIARIO_PREFIX = 'daily-user:'

function obtenerPremioDiario(racha) {
  return BASE_DIARIO + (racha - 1) * PASO_RACHA_DIARIO
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    const reclamo = await global.db.adapter.claimAndUpdate(
      global.db.data,
      `${CLAIM_DIARIO_PREFIX}${m.sender}`,
      ENFRIAMIENTO_DIARIO,
      (datos, ahora) => {
        if (!datos.users[m.sender]) datos.users[m.sender] = {}
        const usuario = datos.users[m.sender]
        const ultimoDiario = usuario.lastDaily || 0
        const tiempoRestante = ENFRIAMIENTO_DIARIO - (ahora - ultimoDiario)
        if (tiempoRestante > 0) {
          return {
            claim: false,
            tiempoRestante,
            proximaRacha: (usuario.dailyStreak || 0) + 1,
          }
        }

        let racha = usuario.dailyStreak || 0
        let nota = ''
        if (ultimoDiario > 0 && ahora - ultimoDiario > ENFRIAMIENTO_DIARIO + 60000) {
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
        usuario.coins = (Number(usuario.coins) || 0) + premio
        usuario.dailyStreak = racha
        usuario.lastDaily = ahora
        return {
          coins: usuario.coins,
          nota,
          premio,
          proximaRacha: racha + 1,
          racha,
        }
      }
    )
    const resultado = reclamo.result

    if (!reclamo.acquired || resultado?.tiempoRestante > 0) {
      const tiempoRestante = resultado?.tiempoRestante || ENFRIAMIENTO_DIARIO
      const horas = Math.floor(tiempoRestante / 3600000)
      const minutos = Math.floor((tiempoRestante % 3600000) / 60000)
      const segundos = Math.floor((tiempoRestante % 60000) / 1000)
      const proximaRacha = resultado?.proximaRacha || 1
      return conn.sendMessage(m.chat, {
        text: `[❗] Ya reclamaste tu daily hoy.\n\n> *Tiempo restante:* ${horas}h ${minutos}m ${segundos}s\n> *Próxima racha:* ${proximaRacha}\n> *Próximo premio:* ${obtenerPremioDiario(proximaRacha).toLocaleString()} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const proximoPremio = obtenerPremioDiario(resultado.proximaRacha)
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
┊ *+${resultado.premio.toLocaleString()} ${global.moneda}*
╰─ ✧  ✩
┊ ${resultado.nota || `${resultado.racha} ${resultado.racha === 1 ? 'día' : 'días'}`}
┊ ahora  ·  \`${resultado.coins.toLocaleString()} ${global.moneda}\`
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
