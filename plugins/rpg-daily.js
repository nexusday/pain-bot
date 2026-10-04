const ENFRIAMIENTO_DIARIO = 24 * 60 * 60 * 1000
const BASE_DIARIO = 9000
const PASO_RACHA_DIARIO = 500
const CLAIM_DIARIO_PREFIX = 'daily-user:'

function obtenerPremioDiario(racha) {
  return BASE_DIARIO + (racha - 1) * PASO_RACHA_DIARIO
}

function obtenerMensajeCooldown(usuario, ahora, tiempoRestanteForzado, proximaRachaForzada) {
  const tiempoRestante = tiempoRestanteForzado ??
    ENFRIAMIENTO_DIARIO - (ahora - (usuario?.lastDaily || 0))
  if (tiempoRestante <= 0) return null
  const horas = Math.floor(tiempoRestante / 3600000)
  const minutos = Math.floor((tiempoRestante % 3600000) / 60000)
  const segundos = Math.floor((tiempoRestante % 60000) / 1000)
  const proximaRacha = proximaRachaForzada ?? (usuario?.dailyStreak || 0) + 1
  return `[❗] Ya reclamaste tu daily hoy.\n\n> *Tiempo restante:* ${horas}h ${minutos}m ${segundos}s\n> *Próxima racha:* ${proximaRacha}\n> *Próximo premio:* ${obtenerPremioDiario(proximaRacha).toLocaleString()} ${global.moneda}`
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
      const usuario = global.db.data.users[m.sender]
      const textoCooldown = obtenerMensajeCooldown(
        usuario,
        Date.now(),
        resultado?.tiempoRestante,
        resultado?.proximaRacha
      )
      return conn.sendMessage(m.chat, {
        text: textoCooldown || '[❌] No se pudo completar el reclamo. Inténtalo de nuevo.',
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
    if (error?.code === 'ERR_SQLITE_LOCK_TIMEOUT') {
      try {
        await global.db.adapter.refresh(global.db.data)
      } catch (refreshError) {
        console.error('[daily] No se pudo actualizar el estado compartido para verificar el cooldown:', refreshError?.message || refreshError)
      }
      const textoCooldown = obtenerMensajeCooldown(global.db.data.users[m.sender], Date.now())
      if (textoCooldown) {
        return conn.sendMessage(m.chat, {
          text: textoCooldown,
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m })
      }
    }
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
