/**
 * Bomba Caliente — lógica del juego y economía
 */

import { resolveDbUser } from './michi-users.js'
import { senderJidCandidates, resolveTargetJids, jidsOverlap } from './group-participant.js'

export const BOMBA_MIN_COINS = 150
export const BOMBA_DEFAULT_BET = 150
export const BOMBA_CELL_COUNT = 10
export const BOMBA_CELL_PREFIX = 'bomba_cell_'

export function normalizarApuesta(amount) {
  const n = Math.floor(Number(amount) || 0)
  if (n < BOMBA_MIN_COINS) return BOMBA_DEFAULT_BET
  return Math.min(n, 10_000_000)
}

export function puedePermitirseApuesta(jid, bet, conn, participants = null) {
  const { user } = resolveDbUser(jid, conn, participants)
  if (!user) return false
  const total = (Number(user.coins) || 0) + (Number(user.bancoDinero) || 0)
  return total >= bet
}

export function descontarDeUsuario(jid, amount) {
  const users = global.db?.data?.users || {}
  const user = users[jid]
  if (!user) return 0
  const billetera = Number(user.coins) || 0
  const banco = Number(user.bancoDinero) || 0
  const total = billetera + banco
  const perdida = Math.min(total, amount)
  let restante = perdida
  const deBilletera = Math.min(billetera, restante)
  user.coins = billetera - deBilletera
  restante -= deBilletera
  if (restante > 0) user.bancoDinero = Math.max(0, banco - restante)
  return perdida
}

export function acreditarUsuario(jid, amount) {
  if (!global.db?.data?.users) global.db.data.users = {}
  if (!global.db.data.users[jid]) global.db.data.users[jid] = {}
  const user = global.db.data.users[jid]
  user.coins = (Number(user.coins) || 0) + amount
}

export function esJugadorDelJuego(m, game, conn, participants = []) {
  const sender = senderJidCandidates(m, conn)
  const p1 = resolveTargetJids(game.player1, participants, conn)
  const p2 = resolveTargetJids(game.player2, participants, conn)
  return jidsOverlap(sender, [...p1, ...p2])
}

export function esJugadorActual(m, game, conn, participants = []) {
  const sender = senderJidCandidates(m, conn)
  const actual = resolveTargetJids(game.currentPlayer, participants, conn)
  return jidsOverlap(sender, actual)
}

function extraerIdDeJson(raw) {
  if (!raw) return ''
  const str = String(raw)
  if (!str.startsWith('{')) return str
  try {
    const p = JSON.parse(str)
    return String(p.id || p.main_arg || p.selected_id || p.selectedRowId || p.rowId || '')
  } catch {
    return ''
  }
}

export function parsearMovimientoBomba(m) {
  const text = (m?.text || '').trim()
  if (/^(10|[1-9])$/.test(text)) {
    const n = parseInt(text, 10)
    if (n >= 1 && n <= BOMBA_CELL_COUNT) return n - 1
  }

  const fuentes = [
    m?.msg?.singleSelectReply?.selectedRowId,
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.msg?.selectedButtonId,
    m?.message?.buttonsResponseMessage?.selectedButtonId,
    m?.msg?.nativeFlowResponseMessage?.paramsJson,
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson,
  ]

  for (const raw of fuentes) {
    const id = extraerIdDeJson(raw) || String(raw || '')
    if (id.startsWith(BOMBA_CELL_PREFIX)) {
      const n = parseInt(id.slice(BOMBA_CELL_PREFIX.length), 10)
      if (n >= 1 && n <= BOMBA_CELL_COUNT) return n - 1
    }
  }
  return null
}

export class JuegoBomba {
  constructor(player1, player2, chatId, bet = BOMBA_DEFAULT_BET) {
    this.player1 = player1
    this.player2 = player2
    this.chatId = chatId
    this.bet = normalizarApuesta(bet)
    this.pot = this.bet * 2
    this.currentPlayer = player1
    this.bombIndex = Math.floor(Math.random() * BOMBA_CELL_COUNT)
    this.cells = Array.from({ length: BOMBA_CELL_COUNT }, () => ({ opened: false, safe: false }))
    this.openedCount = 0
    this.gameActive = true
    this.timeout = null
    this.onTimeout = null
    this.lastMove = Date.now()
    this.winner = null
    this.loser = null
    this.endReason = null
  }

  oponenteDe(jid) {
    return jid === this.player1 ? this.player2 : this.player1
  }

  obtenerIndicesSinAbrir() {
    return this.cells.map((c, i) => (!c.opened ? i : -1)).filter(i => i >= 0)
  }

  /** Si solo queda 1 casilla, el turno actual pierde automáticamente */
  verificarFinForzado() {
    const restantes = this.obtenerIndicesSinAbrir()
    if (restantes.length !== 1) return null
    return {
      forced: true,
      bombIndex: restantes[0],
      loser: this.currentPlayer,
      winner: this.oponenteDe(this.currentPlayer),
      reason: 'ultima_casilla',
    }
  }

  abrirCelda(index, player) {
    if (index < 0 || index >= this.cells.length) return { ok: false, reason: 'invalid' }
    if (!this.gameActive) return { ok: false, reason: 'ended' }

    const celda = this.cells[index]
    if (celda.opened) return { ok: false, reason: 'already' }

    celda.opened = true
    this.openedCount++
    this.lastMove = Date.now()

    if (index === this.bombIndex) {
      this.gameActive = false
      this.loser = player
      this.winner = this.oponenteDe(player)
      this.endReason = 'bomba'
      return { ok: true, hit: true, index }
    }

    celda.safe = true
    this.currentPlayer = this.oponenteDe(player)

    const forzado = this.verificarFinForzado()
    if (forzado) {
      const ultima = this.cells[forzado.bombIndex]
      if (!ultima.opened) {
        ultima.opened = true
        this.openedCount++
      }
      this.gameActive = false
      this.loser = forzado.loser
      this.winner = forzado.winner
      this.endReason = forzado.reason
      return { ok: true, hit: false, index, forcedEnd: forzado }
    }

    if (this.onTimeout) this.iniciarTimeoutInactividad()
    return { ok: true, hit: false, index }
  }

  cancelarJuego(reason = 'cancelled') {
    this.gameActive = false
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
    return { cancelled: true, reason, bet: this.bet }
  }

  iniciarTimeoutInactividad(ms = 60000) {
    if (this.timeout) clearTimeout(this.timeout)
    if (!this.onTimeout) return
    this.timeout = setTimeout(async () => {
      if (this.gameActive) await this.onTimeout(this.cancelarJuego('inactividad'))
    }, ms)
  }

  limpiarTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
  }
}

JuegoBomba.prototype.opponentOf = JuegoBomba.prototype.oponenteDe
JuegoBomba.prototype.getUnopenedIndices = JuegoBomba.prototype.obtenerIndicesSinAbrir
JuegoBomba.prototype.checkForcedEnd = JuegoBomba.prototype.verificarFinForzado
JuegoBomba.prototype.openCell = JuegoBomba.prototype.abrirCelda
JuegoBomba.prototype.cancelGame = JuegoBomba.prototype.cancelarJuego
JuegoBomba.prototype.startInactivityTimeout = JuegoBomba.prototype.iniciarTimeoutInactividad
JuegoBomba.prototype.clearTimeout = JuegoBomba.prototype.limpiarTimeout

export {
  normalizarApuesta as normalizeBet,
  puedePermitirseApuesta as canAffordBet,
  descontarDeUsuario as deductFromUser,
  acreditarUsuario as creditUser,
  esJugadorDelJuego as isGamePlayer,
  esJugadorActual as isCurrentPlayer,
  parsearMovimientoBomba as parseBombaMove,
  JuegoBomba as BombaGame
}
