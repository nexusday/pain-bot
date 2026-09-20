/**
 * Puntuaciones globales de Snake (DB del bot).
 * Cada jugador juega en su propio WebView; el top se actualiza vía API firmada.
 */

export function asegurarSnakeDb() {
  if (!global.db?.data) return null
  if (!global.db.data.users) global.db.data.users = {}
  return global.db.data.users
}

export function statsSnakeDe(jid) {
  const users = asegurarSnakeDb()
  if (!users) return { best: 0, total: 0, games: 0, name: 'Jugador' }
  const u = users[jid] || (users[jid] = {})
  if (!u.snake || typeof u.snake !== 'object') {
    u.snake = { best: 0, total: 0, games: 0, lastClaimAt: 0 }
  }
  return {
    best: Number(u.snake.best) || 0,
    total: Number(u.snake.total) || 0,
    games: Number(u.snake.games) || 0,
    lastClaimAt: Number(u.snake.lastClaimAt) || 0,
    name: u.name || 'Jugador'
  }
}

const SCORE_MAX = 5000
const SCORE_STEP = 10
const COOLDOWN_MS = 12 * 1000

/** Registra score validado (solo desde snake-api). */
export async function registrarScoreSnake(jid, scoreRaw, displayName = '') {
  const score = Math.floor(Number(scoreRaw))
  if (!Number.isFinite(score) || score < 0) {
    return { ok: false, error: 'invalido' }
  }
  if (score > SCORE_MAX) {
    return { ok: false, error: 'alto', max: SCORE_MAX }
  }
  if (score % SCORE_STEP !== 0) {
    return { ok: false, error: 'paso', step: SCORE_STEP }
  }

  const users = asegurarSnakeDb()
  if (!users) return { ok: false, error: 'db' }

  const u = users[jid] || (users[jid] = {})
  if (!u.snake || typeof u.snake !== 'object') {
    u.snake = { best: 0, total: 0, games: 0, lastClaimAt: 0 }
  }

  const now = Date.now()
  if (u.snake.lastClaimAt && now - u.snake.lastClaimAt < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - u.snake.lastClaimAt)) / 1000)
    return { ok: false, error: 'cooldown', wait }
  }

  if (displayName && typeof displayName === 'string') {
    u.name = String(displayName).slice(0, 40)
  }

  const prevBest = Number(u.snake.best) || 0
  const prevTotal = Number(u.snake.total) || 0
  const nuevoBest = Math.max(prevBest, score)
  const nuevoTotal = prevTotal + score
  const games = (Number(u.snake.games) || 0) + 1

  u.snake = {
    best: nuevoBest,
    total: nuevoTotal,
    games,
    lastClaimAt: now,
    lastScore: score
  }

  try {
    await global.db.write()
  } catch {}

  return {
    ok: true,
    score,
    best: nuevoBest,
    total: nuevoTotal,
    games,
    newRecord: score > prevBest
  }
}

/** Top global por récord personal (best). */
export function topSnakeBest(limit = 10) {
  const users = asegurarSnakeDb()
  if (!users) return []
  return Object.entries(users)
    .map(([jid, u]) => ({
      jid,
      name: u?.name || 'Jugador',
      best: Number(u?.snake?.best) || 0,
      total: Number(u?.snake?.total) || 0,
      games: Number(u?.snake?.games) || 0
    }))
    .filter(x => x.best > 0 || x.total > 0)
    .sort((a, b) => b.best - a.best || b.total - a.total)
    .slice(0, limit)
}

/** Top global por puntos acumulados. */
export function topSnakeTotal(limit = 10) {
  const users = asegurarSnakeDb()
  if (!users) return []
  return Object.entries(users)
    .map(([jid, u]) => ({
      jid,
      name: u?.name || 'Jugador',
      best: Number(u?.snake?.best) || 0,
      total: Number(u?.snake?.total) || 0,
      games: Number(u?.snake?.games) || 0
    }))
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total || b.best - a.best)
    .slice(0, limit)
}

export function construirTextoTopSnake(lista, { modo = 'best' } = {}) {
  if (!lista.length) {
    return `🐍 *Top Snake*\n\nAún no hay puntuaciones.\nJuega con el comando del juego; al terminar se guardan solos.`
  }

  const titulo = modo === 'total'
    ? '🐍 *Top Snake · acumulado*'
    : '🐍 *Top Snake · récords*'

  let texto = `${titulo}\n\n`
  lista.forEach((u, i) => {
    const pos = i + 1
    const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `${pos}.`
    const valor = modo === 'total' ? u.total : u.best
    texto += `${medal} *${u.name}*\n`
    texto += `› Récord: *${u.best}* · Total: *${u.total}* · Partidas: *${u.games}*\n\n`
  })
  return texto.trim()
}

export {
  SCORE_MAX as snakeScoreMax,
  SCORE_STEP as snakeScoreStep,
  COOLDOWN_MS as snakeCooldownMs
}
