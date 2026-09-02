/**
 * Bomba Caliente — lógica del juego y economía
 */

import { resolveDbUser } from './michi-users.js'
import { senderJidCandidates, resolveTargetJids, jidsOverlap } from './group-participant.js'

export const BOMBA_MIN_COINS = 150
export const BOMBA_DEFAULT_BET = 150
export const BOMBA_CELL_COUNT = 10
export const BOMBA_CELL_PREFIX = 'bomba_cell_'

export function normalizeBet(amount) {
  const n = Math.floor(Number(amount) || 0)
  return n >= BOMBA_MIN_COINS ? n : BOMBA_MIN_COINS
}

export function canAffordBet(jid, bet, conn, participants = null) {
  const { user } = resolveDbUser(jid, conn, participants)
  if (!user) return false
  const total = (Number(user.coins) || 0) + (Number(user.bancoDinero) || 0)
  return total >= bet
}

export function deductFromUser(jid, amount) {
  const users = global.db?.data?.users || {}
  const user = users[jid]
  if (!user) return 0
  const wallet = Number(user.coins) || 0
  const bank = Number(user.bancoDinero) || 0
  const total = wallet + bank
  const loss = Math.min(total, amount)
  let remaining = loss
  const fromWallet = Math.min(wallet, remaining)
  user.coins = wallet - fromWallet
  remaining -= fromWallet
  if (remaining > 0) user.bancoDinero = Math.max(0, bank - remaining)
  return loss
}

export function creditUser(jid, amount) {
  if (!global.db?.data?.users) global.db.data.users = {}
  if (!global.db.data.users[jid]) global.db.data.users[jid] = {}
  const user = global.db.data.users[jid]
  user.coins = (Number(user.coins) || 0) + amount
}

export function isGamePlayer(m, game, conn, participants = []) {
  const sender = senderJidCandidates(m, conn)
  const p1 = resolveTargetJids(game.player1, participants, conn)
  const p2 = resolveTargetJids(game.player2, participants, conn)
  return jidsOverlap(sender, [...p1, ...p2])
}

export function isCurrentPlayer(m, game, conn, participants = []) {
  const sender = senderJidCandidates(m, conn)
  const current = resolveTargetJids(game.currentPlayer, participants, conn)
  return jidsOverlap(sender, current)
}

function extractIdFromJson(raw) {
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

export function parseBombaMove(m) {
  const text = (m?.text || '').trim()
  if (/^(10|[1-9])$/.test(text)) {
    const n = parseInt(text, 10)
    if (n >= 1 && n <= BOMBA_CELL_COUNT) return n - 1
  }

  const sources = [
    m?.msg?.singleSelectReply?.selectedRowId,
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.msg?.selectedButtonId,
    m?.message?.buttonsResponseMessage?.selectedButtonId,
    m?.msg?.nativeFlowResponseMessage?.paramsJson,
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson,
  ]

  for (const raw of sources) {
    const id = extractIdFromJson(raw) || String(raw || '')
    if (id.startsWith(BOMBA_CELL_PREFIX)) {
      const n = parseInt(id.slice(BOMBA_CELL_PREFIX.length), 10)
      if (n >= 1 && n <= BOMBA_CELL_COUNT) return n - 1
    }
  }
  return null
}

export class BombaGame {
  constructor(player1, player2, chatId, bet = BOMBA_DEFAULT_BET) {
    this.player1 = player1
    this.player2 = player2
    this.chatId = chatId
    this.bet = normalizeBet(bet)
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

  opponentOf(jid) {
    return jid === this.player1 ? this.player2 : this.player1
  }

  getUnopenedIndices() {
    return this.cells.map((c, i) => (!c.opened ? i : -1)).filter(i => i >= 0)
  }

  /** Si solo queda 1 casilla, el turno actual pierde automáticamente */
  checkForcedEnd() {
    const left = this.getUnopenedIndices()
    if (left.length !== 1) return null
    return {
      forced: true,
      bombIndex: left[0],
      loser: this.currentPlayer,
      winner: this.opponentOf(this.currentPlayer),
      reason: 'ultima_casilla',
    }
  }

  openCell(index, player) {
    if (index < 0 || index >= this.cells.length) return { ok: false, reason: 'invalid' }
    if (!this.gameActive) return { ok: false, reason: 'ended' }

    const cell = this.cells[index]
    if (cell.opened) return { ok: false, reason: 'already' }

    cell.opened = true
    this.openedCount++
    this.lastMove = Date.now()

    if (index === this.bombIndex) {
      this.gameActive = false
      this.loser = player
      this.winner = this.opponentOf(player)
      this.endReason = 'bomba'
      return { ok: true, hit: true, index }
    }

    cell.safe = true
    this.currentPlayer = this.opponentOf(player)

    const forced = this.checkForcedEnd()
    if (forced) {
      const last = this.cells[forced.bombIndex]
      if (!last.opened) {
        last.opened = true
        this.openedCount++
      }
      this.gameActive = false
      this.loser = forced.loser
      this.winner = forced.winner
      this.endReason = forced.reason
      return { ok: true, hit: false, index, forcedEnd: forced }
    }

    if (this.onTimeout) this.startInactivityTimeout()
    return { ok: true, hit: false, index }
  }

  cancelGame(reason = 'cancelled') {
    this.gameActive = false
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
    return { cancelled: true, reason, bet: this.bet }
  }

  startInactivityTimeout(ms = 60000) {
    if (this.timeout) clearTimeout(this.timeout)
    if (!this.onTimeout) return
    this.timeout = setTimeout(async () => {
      if (this.gameActive) await this.onTimeout(this.cancelGame('inactividad'))
    }, ms)
  }

  clearTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
  }
}
