const XP_FACIL_HASTA = 20

export function xpRequeridoParaNivel(level) {
  const nv = Math.max(1, Math.floor(Number(level) || 1))
  if (nv === 1) return 100
  if (nv === 2) return 250
  if (nv <= 20) {
    return Math.floor(250 * Math.pow(1.12, nv - 2) + (nv - 2) * 45)
  }
  const en20 = Math.floor(250 * Math.pow(1.12, 18) + 18 * 45)
  return Math.floor(en20 * Math.pow(nv / 20, 1.72) + (nv - 20) * 220)
}

export function gananciaXpParaNivel(level) {
  const nv = Math.max(1, Math.floor(Number(level) || 1))
  if (nv <= XP_FACIL_HASTA) return 5
  if (nv <= 40) return 6
  if (nv <= 80) return 7
  if (nv <= 150) return 8
  return 10
}

export function recompensaSubidaNivel(completedLevel) {
  const nv = Math.max(1, Math.floor(Number(completedLevel) || 1))
  if (nv === 1) return 1000
  if (nv === 2) return 1600
  return Math.floor(1600 * Math.pow(1.28, nv - 2) + (nv - 2) * 180)
}

export function recompensaProximoNivel(currentLevel) {
  return recompensaSubidaNivel(Math.max(1, Math.floor(Number(currentLevel) || 1)))
}

export function glifosBarraProgreso(level) {
  const nv = Math.max(1, Math.floor(Number(level) || 1))
  if (nv < 10) return { fill: '█', empty: '░', mark: '・' }
  if (nv < 25) return { fill: '▓', empty: '░', mark: '✦' }
  if (nv < 50) return { fill: '◆', empty: '◇', mark: '✧' }
  if (nv < 100) return { fill: '★', empty: '☆', mark: '❖' }
  if (nv < 200) return { fill: '✦', empty: '✧', mark: '☾' }
  return { fill: '◈', empty: '○', mark: '♛' }
}

export function construirBarraProgreso(current, required, level, size = 10) {
  const necesario = Math.max(1, Number(required) || 1)
  const tiene = Math.max(0, Math.min(necesario, Number(current) || 0))
  const llenos = Math.round((tiene / necesario) * size)
  const { fill, empty, mark } = glifosBarraProgreso(level)
  return `${mark} ${fill.repeat(llenos)}${empty.repeat(Math.max(0, size - llenos))} ${mark}`
}

export function asegurarUsuarioRpg(user = {}) {
  if (typeof user !== 'object' || user === null) return user

  if (!Number.isFinite(user.level) || user.level < 1) user.level = 1
  if (!Number.isFinite(user.exp) || user.exp < 0) user.exp = 0
  if (!Number.isFinite(user.coins) || user.coins < 0) user.coins = 0
  if (!Number.isFinite(user.commandCount) || user.commandCount < 0) user.commandCount = 0
  if (!Number.isFinite(user.stickerCount) || user.stickerCount < 0) user.stickerCount = 0

  if (!user.rpgV2) {
    user.level = Math.max(1, Math.floor(user.level) || 1)
    user.exp = 0
    user.rpgV2 = true
  }

  const necesario = xpRequeridoParaNivel(user.level)
  if (user.exp >= necesario) {
    aplicarSubidasNivel(user)
  }

  return user
}

function aplicarSubidasNivel(user) {
  let ganados = 0
  let recompensaTotal = 0
  let guarda = 0

  while (guarda++ < 5000) {
    const necesario = xpRequeridoParaNivel(user.level)
    if (user.exp < necesario) break

    const completado = user.level
    const premio = recompensaSubidaNivel(completado)
    user.exp -= necesario
    user.level += 1
    user.coins = (Number(user.coins) || 0) + premio
    recompensaTotal += premio
    ganados += 1
  }

  return { gained: ganados, rewardTotal: recompensaTotal }
}

export function otorgarProgresoComando(user, { isSticker = false } = {}) {
  asegurarUsuarioRpg(user)

  const antes = user.level
  const ganancia = gananciaXpParaNivel(user.level)
  user.exp += ganancia
  user.commandCount += 1
  if (isSticker) user.stickerCount += 1

  const { gained: levelsGained, rewardTotal } = aplicarSubidasNivel(user)
  const necesario = xpRequeridoParaNivel(user.level)
  const moneda = global.moneda || 'USD'

  return {
    gain: ganancia,
    level: user.level,
    exp: user.exp,
    required: necesario,
    leveled: levelsGained > 0,
    levelsGained,
    before: antes,
    reward: rewardTotal,
    nextReward: recompensaProximoNivel(user.level),
    nextLevel: user.level + 1,
    coins: user.coins,
    moneda,
    commandCount: user.commandCount,
    stickerCount: user.stickerCount,
  }
}

export function esMensajeSticker(m) {
  if (!m) return false
  if (m.mtype === 'stickerMessage') return true
  if (m.message?.stickerMessage) return true
  return false
}

export function rastrearStickerEnviado(user) {
  asegurarUsuarioRpg(user)
  user.stickerCount += 1
  return user.stickerCount
}

export function obtenerSnapshotRpg(user = {}) {
  asegurarUsuarioRpg(user)
  const required = xpRequeridoParaNivel(user.level)
  return {
    level: user.level,
    exp: user.exp,
    required,
    ratio: `${user.exp}/${required}`,
    bar: construirBarraProgreso(user.exp, required, user.level),
    commandCount: user.commandCount || 0,
    stickerCount: user.stickerCount || 0,
    nextGain: gananciaXpParaNivel(user.level),
    nextReward: recompensaProximoNivel(user.level),
  }
}

export function formatearNumero(n) {
  return Number(n || 0).toLocaleString('es-ES')
}

export function formatearMensajeSubidaNivel(rpg) {
  const moneda = rpg.moneda || global.moneda || 'USD'
  const reward = formatearNumero(rpg.reward || 0)
  const next = formatearNumero(rpg.nextReward || 0)
  return [
    `☾ *¡Subiste de nivel!*`,
    ``,
    `> Nivel *${rpg.before}* → *${rpg.level}*`,
    `> Premio: *+${reward} ${moneda}*`,
    `> EXP: *${rpg.exp}/${rpg.required}*`,
    `> Próximo premio (nv. ${rpg.nextLevel}): *${next} ${moneda}*`,
  ].join('\n')
}

export {
  xpRequeridoParaNivel as xpRequiredForLevel,
  gananciaXpParaNivel as xpGainForLevel,
  recompensaSubidaNivel as levelUpReward,
  recompensaProximoNivel as nextLevelReward,
  glifosBarraProgreso as progressBarGlyphs,
  construirBarraProgreso as buildProgressBar,
  asegurarUsuarioRpg as ensureRpgUser,
  otorgarProgresoComando as awardCommandProgress,
  esMensajeSticker as isStickerMessage,
  rastrearStickerEnviado as trackSentSticker,
  obtenerSnapshotRpg as getRpgSnapshot,
  formatearNumero as formatNumber,
  formatearMensajeSubidaNivel as formatLevelUpMessage
}
