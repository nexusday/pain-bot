import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { readSubbotWorkerStatuses } from '../subbot-status.js'
import {
  limpiarCredencialesSubBot,
  limpiarEmparejamiento,
  marcarEmparejamiento,
  necesitaRevinculacion,
  tieneAjustesGuardados,
} from '../subbot-recovery.js'
import { canRegisterSubBot } from '../max-subs.js'
import { releaseSessionLease, requestSessionLease } from '../process-isolation.js'
import { normalizarTelefono } from './session-ops.js'
import { purgarPushAntiguo } from './push.js'

const ESTADOS_TERMINALES = new Set(['linked', 'expired', 'error', 'cancelled'])

export class PairingError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * ¿Hay workers de sub-bots vivos? Si los hay, el principal ya no hace falta
 * para vincular un sub-bot nuevo: su worker lo conecta igual. Los sub-bots
 * son independientes del principal.
 */
export function hayWorkersConSesiones(root = process.cwd()) {
  try {
    for (const worker of readSubbotWorkerStatuses(root)) {
      if ((worker.sessions || []).length) return true
    }
  } catch {}
  return false
}

/**
 * Orquesta las vinculaciones desde la web. El socket real lo sigue creando
 * `plugins/serbot-serbot.js` en modo `pairingOnly`; aquí solo se controla el
 * ciclo de vida, los límites y el estado persistido.
 */
export class PairingManager {
  constructor({ store, config, logger = console }) {
    this.store = store
    this.config = config
    this.logger = logger
    this.activos = new Map()
    this.limpiador = setInterval(() => this.limpiarAntiguos(), 10 * 60 * 1000)
    this.limpiador.unref?.()
  }

  /**
   * Límite configurable desde el panel de administración. Si el admin no lo
   * tocó, se usa el valor de la configuración/entorno.
   */
  async #limite(clave, porDefecto) {
    const guardado = await this.store.obtenerAjusteNumericoOpcional(clave)
    if (guardado !== null) return guardado
    return porDefecto
  }

  /** Minutos que faltan para que se libere la ventana del límite. */
  async #minutosRestantes({ userId = null, ip = null, ventanaMs }) {
    try {
      const primero = await this.store.primerPairingReciente({
        userId,
        ip,
        since: Date.now() - ventanaMs,
      })
      if (!primero) return 0
      const restante = primero + ventanaMs - Date.now()
      return Math.max(1, Math.ceil(restante / 60000))
    } catch {
      return 0
    }
  }

  async #validarLimites({ userId, phone, ip }) {
    const ahora = Date.now()
    const VENTANA_HORA = 60 * 60 * 1000
    const VENTANA_DIA = 24 * 60 * 60 * 1000

    const maxHora = await this.#limite('pair_attempts_hour', this.config.maxPairAttemptsPerHour || 12)
    const hora = await this.store.contarPairingsRecientes({ userId, since: ahora - VENTANA_HORA })
    if (maxHora > 0 && hora >= maxHora) {
      const minutos = await this.#minutosRestantes({ userId, ventanaMs: VENTANA_HORA })
      throw new PairingError(
        'rate_limit',
        `Llegaste al máximo de ${maxHora} intentos por hora (llevas ${hora}). ` +
        `Espera ${minutos} min o pide al administrador que lo amplíe.`
      )
    }

    const maxDia = await this.#limite('pair_attempts_day', this.config.maxPairAttemptsPerDay || 40)
    const dia = await this.store.contarPairingsRecientes({ userId, since: ahora - VENTANA_DIA })
    if (maxDia > 0 && dia >= maxDia) {
      const horas = await this.#minutosRestantes({ userId, ventanaMs: VENTANA_DIA })
      throw new PairingError(
        'rate_limit_day',
        `Llegaste al máximo de ${maxDia} vinculaciones por día (llevas ${dia}). ` +
        `Se libera en ${horas > 59 ? `${Math.ceil(horas / 60)} h` : `${horas} min`}.`
      )
    }

    const maxIp = await this.#limite('pair_attempts_ip_hour', this.config.maxPairAttemptsPerIpPerHour || 20)
    const porIp = await this.store.contarPairingsRecientes({ ip, since: ahora - VENTANA_HORA })
    if (maxIp > 0 && porIp >= maxIp) {
      const minutos = await this.#minutosRestantes({ ip, ventanaMs: VENTANA_HORA })
      throw new PairingError(
        'rate_limit_ip',
        `Desde esta conexión ya van ${porIp} intentos (máximo ${maxIp}). Espera ${minutos} min.`
      )
    }

    if (!this.config.allowRegistration && !(await this.store.buscarUsuarioPorId(userId))) {
      throw new PairingError('forbidden', 'No autorizado.')
    }

    // Máximo de sub-bots por cuenta (0 = sin límite).
    const maxPorUsuario = await this.store.obtenerAjusteNumerico('max_subs_per_user', 0)
    if (maxPorUsuario > 0) {
      const bots = await this.store.contarBotsUsuario(userId, phone)
      if (bots >= maxPorUsuario) {
        throw new PairingError(
          'user_limit',
          `Tu cuenta ya tiene el máximo de ${maxPorUsuario} sub-bot(s). Pide al administrador que lo amplíe.`
        )
      }
    }

    // Máximo de cuentas vinculadas por IP (0 = sin límite).
    const maxPorIp = await this.store.obtenerAjusteNumerico('max_bots_per_ip', 0)
    if (maxPorIp > 0 && ip) {
      const cuentas = await this.store.contarBotsPorIp(ip, phone)
      if (cuentas >= maxPorIp) {
        throw new PairingError(
          'ip_limit',
          `Desde esta conexión ya hay ${cuentas} cuentas vinculadas (máximo ${maxPorIp}).`
        )
      }
    }
  }

  async #esperarCodigo(id, timeoutMs = 30_000) {
    const limite = Date.now() + timeoutMs
    while (Date.now() < limite) {
      const pairing = await this.store.obtenerPairing(id)
      if (!pairing) return null
      if (pairing.code) return pairing.code
      if (ESTADOS_TERMINALES.has(pairing.status)) return null
      await esperar(250)
    }
    return null
  }

  /**
   * Crea un intento de vinculación y espera (brevemente) a que Baileys
   * entregue el código. Devuelve el pairing persistido y el código si ya está.
   */
  async iniciar({ userId, phone, ip, userAgent, force = false, skipCooldown = false }) {
    const numero = normalizarTelefono(phone)
    if (!numero) throw new PairingError('invalid_phone', 'El número de WhatsApp no es válido.')
    // El principal NO es obligatorio: los sub-bots son independientes y su
    // worker los conecta igual. Antes esto exigía el principal y los usuarios
    // no podían vincular su sub-bot desde el panel.

    const existente = await this.store.obtenerBotPorPhone(numero)
    if (existente && Number(existente.user_id) !== Number(userId)) {
      throw new PairingError('phone_owned', 'Ese número ya está vinculado a otra cuenta.')
    }
    if (existente && Number(existente.user_id) === Number(userId) && existente.status === 'linked' && !force) {
      throw new PairingError('already_linked', 'Ese número ya está vinculado. Usa "Re-vincular" si quieres reemplazarlo.')
    }

    for (const [activoPhone, estado] of this.activos) {
      if (activoPhone !== numero) continue
      const pairing = await this.store.obtenerPairing(estado.id)
      if (pairing && !ESTADOS_TERMINALES.has(pairing.status)) {
        return { pairing, code: pairing.code || null, reused: true }
      }
      this.activos.delete(activoPhone)
    }

    await this.#validarLimites({ userId, phone: numero, ip })
    if (!skipCooldown) {
      // Espera entre códigos del MISMO número (configurable desde el panel).
      const esperaMs = Math.max(
        0,
        await this.#limite('pair_cooldown_ms', Number(this.config.pairCooldownMs ?? 30_000))
      )
      if (esperaMs > 0) {
        const recientes = await this.store.contarPairingsRecientes({
          phone: numero,
          since: Date.now() - esperaMs,
        })
        if (recientes > 0) {
          const segundos = Math.max(1, Math.ceil(esperaMs / 1000))
          throw new PairingError(
            'cooldown',
            `Espera ${segundos} s antes de pedir otro código para ese número.`
          )
        }
      }
    }

    const ranura = canRegisterSubBot(numero)
    if (!ranura.ok) {
      throw new PairingError('no_slots', 'No hay plazas disponibles para nuevos sub-bots.')
    }
    // `canRegisterSubBot` cuenta credenciales ya escritas. Los intentos web
    // todavía no tienen creds.json, así que también reservan plaza para evitar
    // que dos vinculaciones simultáneas salten el límite.
    if (!ranura.reconnect && !ranura.unlimited) {
      const enCurso = await this.store.contarPairingsActivos()
      if (ranura.registered + enCurso >= ranura.max) {
        throw new PairingError('no_slots', 'No hay plazas disponibles para nuevos sub-bots.')
      }
    }

    const id = crypto.randomUUID()
    const ttlCodigo = await this.#limite('pair_code_ttl_ms', this.config.codeTtlMs || 90_000)
    const pairing = await this.store.crearPairing({
      id,
      userId,
      phone: numero,
      ip,
      userAgent,
      expiresAt: Date.now() + this.config.pairTtlMs,
    })

    const estado = { id, phone: numero, userId: Number(userId), cancelado: false }
    this.activos.set(numero, estado)
    estado.promesa = this.#ejecutar(pairing, estado, { force, ttlCodigo })
      .catch((error) => {
        this.logger.error?.(`[webpanel] pairing ${id}:`, error?.message || error)
      })
      .finally(() => {
        if (this.activos.get(numero) === estado) this.activos.delete(numero)
      })

    const code = await this.#esperarCodigo(id, 30_000)
    return { pairing: await this.store.obtenerPairing(id), code, reused: false }
  }

  async #ejecutar(pairing, estado, { force = false, ttlCodigo = null } = {}) {
    const root = this.config.root
    const folder = pairing.phone
    const ruta = path.join(root, folder)
    const managed = process.env.PAIN_ROLE === 'primary'
    let lease = false
    let modulo = null

    try {
      marcarEmparejamiento(ruta, {
        pairingId: pairing.id,
        userId: pairing.user_id,
        source: 'webpanel',
      })

      modulo = await import('../../plugins/serbot-serbot.js')

      // Modo standalone (sin supervisor): cierra el socket vivo si re-vincula.
      if (!managed && force) {
        try { await modulo.retirarSesionDeWorker(ruta, { handoff: false }) } catch {}
      }

      if (managed) {
        lease = await requestSessionLease(folder)
        if (!lease) {
          throw new PairingError('busy', 'La sesión está ocupada en este momento. Intenta de nuevo.')
        }
      }

      const forzar = force ||
        necesitaRevinculacion(root, folder) ||
        tieneAjustesGuardados(root, folder)

      // Nombre del usuario del panel: se lo pasa al sub-bot para el mensaje
      // de bienvenida que se envía a sí mismo al vincularse.
      let usuarioPanel = ''
      try {
        const usuario = await this.store.buscarUsuarioPorId(pairing.user_id)
        usuarioPanel = usuario?.username || ''
      } catch {}

      await modulo.AYBot({
        pathAYBot: ruta,
        m: null,
        conn: null,
        args: [],
        usedPrefix: '.',
        command: 'code',
        fromCommand: true,
        phoneNumber: folder,
        replyJid: null,
        supervisorHandoff: managed,
        esperarConexion: true,
        timeoutConexionMs: this.config.pairTtlMs,
        pairingOnly: true,
        forzarRevinculacion: forzar,
        usuarioPanel,
        onPairingCode: async (code) => {
          if (estado.cancelado) return
          const duracion = ttlCodigo || this.config.codeTtlMs || 90_000
          await this.store.actualizarPairing(pairing.id, {
            status: 'code_ready',
            code,
            error: null,
            expiresAt: Date.now() + duracion,
          })
          await this.store.registrarAuditoria({
            userId: pairing.user_id,
            action: 'bot.code_ready',
            ip: pairing.ip,
            meta: { phone: folder },
          })
        },
      })

      if (estado.cancelado) return
      const ahora = Date.now()
      await this.store.actualizarPairing(pairing.id, {
        status: 'linked',
        linkedAt: ahora,
        error: null,
      })
      await this.store.upsertBot({
        userId: pairing.user_id,
        phone: folder,
        folder,
        status: 'linked',
        linkedAt: ahora,
        linkedIp: pairing.ip || null,
      })
      await this.store.registrarAuditoria({
        userId: pairing.user_id,
        action: 'bot.linked',
        ip: pairing.ip,
        meta: { phone: folder },
      })
    } catch (error) {
      const cancelado = estado.cancelado || error?.code === 'PAIRING_CANCELLED'
      const estadoFinal = cancelado ? 'cancelled' : (/tiempo agotado|timeout/i.test(String(error?.message)) ? 'expired' : 'error')
      if (!estado.cancelado) {
        await this.store.actualizarPairing(pairing.id, {
          status: estadoFinal,
          error: String(error?.message || error).slice(0, 300),
        }).catch(() => {})
      }
      await this.store.registrarAuditoria({
        userId: pairing.user_id,
        action: `bot.link_${estadoFinal}`,
        ip: pairing.ip,
        meta: { phone: folder, error: String(error?.message || error).slice(0, 200) },
      }).catch(() => {})

      // No dejar credenciales a medias. Si ya quedó registrada, se respeta.
      try {
        const creds = JSON.parse(fs.readFileSync(path.join(ruta, 'creds.json'), 'utf8'))
        if (creds?.registered !== true) {
          limpiarCredencialesSubBot(ruta, root)
        }
      } catch {}
    } finally {
      limpiarEmparejamiento(ruta)
      if (lease) {
        // Se libera DESPUÉS de quitar `.pairing` para que el supervisor vea la
        // carpeta y asigne la sesión al worker que corresponde.
        releaseSessionLease(folder)
      } else if (managed) {
        releaseSessionLease(folder)
      }
    }
  }

  async estado(id, userId, { admin = false } = {}) {
    const pairing = await this.store.obtenerPairing(id)
    if (!pairing) throw new PairingError('not_found', 'Vinculación no encontrada.')
    if (!admin && Number(pairing.user_id) !== Number(userId)) {
      throw new PairingError('forbidden', 'No autorizado.')
    }
    if (!ESTADOS_TERMINALES.has(pairing.status) && pairing.expires_at < Date.now()) {
      await this.store.actualizarPairing(id, { status: 'expired', error: 'Código expirado.' })
      pairing.status = 'expired'
    }
    return pairing
  }

  async cancelar(id, userId, { admin = false } = {}) {
    const pairing = await this.store.obtenerPairing(id)
    if (!pairing) throw new PairingError('not_found', 'Vinculación no encontrada.')
    if (!admin && Number(pairing.user_id) !== Number(userId)) {
      throw new PairingError('forbidden', 'No autorizado.')
    }
    const estado = this.activos.get(pairing.phone)
    if (estado && estado.id === id) {
      estado.cancelado = true
      try {
        const modulo = await import('../../plugins/serbot-serbot.js')
        await modulo.retirarSesionDeWorker(path.join(this.config.root, pairing.phone), { handoff: false })
      } catch {}
    }
    if (!ESTADOS_TERMINALES.has(pairing.status)) {
      await this.store.actualizarPairing(id, { status: 'cancelled', error: 'Cancelado por el usuario.' })
    }
    return this.store.obtenerPairing(id)
  }

  async regenerar(id, userId, { ip = null, userAgent = null } = {}) {
    const pairing = await this.store.obtenerPairing(id)
    if (!pairing) throw new PairingError('not_found', 'Vinculación no encontrada.')
    if (Number(pairing.user_id) !== Number(userId)) {
      throw new PairingError('forbidden', 'No autorizado.')
    }
    await this.cancelar(id, userId)
    return this.iniciar({
      userId,
      phone: pairing.phone,
      ip,
      userAgent,
      force: true,
      skipCooldown: true,
    })
  }

  async limpiarAntiguos() {
    try {
      await this.store.limpiarSesionesExpiradas()
      await this.store.limpiarTokensCorreo(Date.now() - 7 * 24 * 60 * 60 * 1000)
      await this.store.limpiarPairingsAntiguos({ olderThan: Date.now() - 7 * 24 * 60 * 60 * 1000 })
      // Retención: auditoría 90 días, campañas push 30 días (solidaria a sus deliveries).
      await this.store.limpiarAuditoria(Date.now() - 90 * 24 * 60 * 60 * 1000)
      await purgarPushAntiguo(this.store, Date.now() - 30 * 24 * 60 * 60 * 1000)
    } catch {}
  }

  async cerrar() {
    clearInterval(this.limpiador)
    for (const estado of [...this.activos.values()]) {
      estado.cancelado = true
      try {
        const modulo = await import('../../plugins/serbot-serbot.js')
        await modulo.retirarSesionDeWorker(path.join(this.config.root, estado.phone), { handoff: false })
      } catch {}
    }
    this.activos.clear()
  }
}
