const XP_EASY_UNTIL = 20

export function xpRequiredForLevel(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1))
  if (lv === 1) return 100
  if (lv === 2) return 250
  if (lv <= 20) {
    return Math.floor(250 * Math.pow(1.12, lv - 2) + (lv - 2) * 45)
  }
  const at20 = Math.floor(250 * Math.pow(1.12, 18) + 18 * 45)
  return Math.floor(at20 * Math.pow(lv / 20, 1.72) + (lv - 20) * 220)
}

export function xpGainForLevel(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1))
  if (lv <= XP_EASY_UNTIL) return 5
  if (lv <= 40) return 6
  if (lv <= 80) return 7
  if (lv <= 150) return 8
  return 10
}

export function progressBarGlyphs(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1))
  if (lv < 10) return { fill: '█', empty: '░', mark: '・' }
  if (lv < 25) return { fill: '▓', empty: '░', mark: '✦' }
  if (lv < 50) return { fill: '◆', empty: '◇', mark: '✧' }
  if (lv < 100) return { fill: '★', empty: '☆', mark: '❖' }
  if (lv < 200) return { fill: '✦', empty: '✧', mark: '☾' }
  return { fill: '◈', empty: '○', mark: '♛' }
}

export function buildProgressBar(current, required, level, size = 10) {
  const need = Math.max(1, Number(required) || 1)
  const have = Math.max(0, Math.min(need, Number(current) || 0))
  const filled = Math.round((have / need) * size)
  const { fill, empty, mark } = progressBarGlyphs(level)
  return `${mark} ${fill.repeat(filled)}${empty.repeat(Math.max(0, size - filled))} ${mark}`
}

export function ensureRpgUser(user = {}) {
  if (typeof user !== 'object' || user === null) return user

  if (!Number.isFinite(user.level) || user.level < 1) user.level = 1
  if (!Number.isFinite(user.exp) || user.exp < 0) user.exp = 0
  if (!Number.isFinite(user.commandCount) || user.commandCount < 0) user.commandCount = 0
  if (!Number.isFinite(user.stickerCount) || user.stickerCount < 0) user.stickerCount = 0

  if (!user.rpgV2) {
    user.level = Math.max(1, Math.floor(user.level) || 1)
    user.exp = 0
    user.rpgV2 = true
  }

  const need = xpRequiredForLevel(user.level)
  if (user.exp >= need) {
    applyLevelUps(user)
  }

  return user
}

function applyLevelUps(user) {
  let gained = 0
  let guard = 0
  while (guard++ < 5000) {
    const need = xpRequiredForLevel(user.level)
    if (user.exp < need) break
    user.exp -= need
    user.level += 1
    gained += 1
  }
  return gained
}

export function awardCommandProgress(user, { isSticker = false } = {}) {
  ensureRpgUser(user)

  const before = user.level
  const gain = xpGainForLevel(user.level)
  user.exp += gain
  user.commandCount += 1
  if (isSticker) user.stickerCount += 1

  const levelsGained = applyLevelUps(user)
  const need = xpRequiredForLevel(user.level)

  return {
    gain,
    level: user.level,
    exp: user.exp,
    required: need,
    leveled: levelsGained > 0,
    levelsGained,
    before,
    commandCount: user.commandCount,
    stickerCount: user.stickerCount,
  }
}

export function isStickerMessage(m) {
  if (!m) return false
  if (m.mtype === 'stickerMessage') return true
  if (m.message?.stickerMessage) return true
  return false
}

export function trackSentSticker(user) {
  ensureRpgUser(user)
  user.stickerCount += 1
  return user.stickerCount
}

export function getRpgSnapshot(user = {}) {
  ensureRpgUser(user)
  const required = xpRequiredForLevel(user.level)
  return {
    level: user.level,
    exp: user.exp,
    required,
    ratio: `${user.exp}/${required}`,
    bar: buildProgressBar(user.exp, required, user.level),
    commandCount: user.commandCount || 0,
    stickerCount: user.stickerCount || 0,
    nextGain: xpGainForLevel(user.level),
  }
}

export function formatNumber(n) {
  return Number(n || 0).toLocaleString('es-ES')
}
