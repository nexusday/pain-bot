const DAILY_COOLDOWN = 24 * 60 * 60 * 1000
const DAILY_BASE = 9000
const DAILY_STREAK_STEP = 500

function getDailyReward(streak) {
  return DAILY_BASE + (streak - 1) * DAILY_STREAK_STEP
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    let user = global.db.data.users[m.sender]
    if (!user) global.db.data.users[m.sender] = {}

    user = global.db.data.users[m.sender]
    const coins = user.coins || 0

    const lastDaily = user.lastDaily || 0
    const timeLeft = DAILY_COOLDOWN - (Date.now() - lastDaily)

    if (timeLeft > 0) {
      const hours = Math.floor(timeLeft / 3600000)
      const minutes = Math.floor((timeLeft % 3600000) / 60000)
      const seconds = Math.floor((timeLeft % 60000) / 1000)
      const nextStreak = (user.dailyStreak || 0) + 1

      return conn.sendMessage(m.chat, {
        text: `[❗] Ya reclamaste tu daily hoy.\n\n> *⏱️ Tiempo restante:* ${hours}h ${minutes}m ${seconds}s\n\n> *🎯 Tu próxima racha:* ${nextStreak} 🔥\n> *Próximo premio:* ${getDailyReward(nextStreak).toLocaleString()} ${global.moneda}`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    let streak = user.dailyStreak || 0
    let mensaje = ''

    const timeSinceLastClaim = Date.now() - lastDaily
    if (lastDaily > 0 && timeSinceLastClaim > DAILY_COOLDOWN + 60000) {
      streak = 0
      mensaje = '❌ *¡Perdiste tu racha!* No reclamaste a tiempo'
    }

    if (streak === 0) {
      streak = 1
      if (lastDaily === 0) {
        mensaje = '🎉 *¡Primer daily!* Bienvenido al sistema de rachas'
      }
    } else {
      streak++
      if (!mensaje) mensaje = `🔥 *¡Racha de ${streak} días!* Sigue así`
    }

    const premio = getDailyReward(streak)
    const nextPremio = getDailyReward(streak + 1)

    user.coins = coins + premio
    user.dailyStreak = streak
    user.lastDaily = Date.now()

    const nextClaim = new Date(Date.now() + DAILY_COOLDOWN)
    const nextDate = nextClaim.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })

    const txt = `🎁 *𝗗𝗮𝗶𝗹𝘆*

> *Racha:* ${streak} 🔥
> *Premio hoy:* +${premio.toLocaleString()} ${global.moneda}
> *Total:* ${user.coins.toLocaleString()} ${global.moneda}
> ${mensaje}

> *Mañana (racha ${streak + 1}):* +${nextPremio.toLocaleString()} ${global.moneda}
> *Próximo claim:* ${nextDate}

_Escala: día 1 = 9K, cada día +500 (9K → 9.5K → 10K…)_`

    return conn.sendMessage(m.chat, {
      text: txt,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
  } catch (e) {
    console.error('Error en daily:', e)
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
