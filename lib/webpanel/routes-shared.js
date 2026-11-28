/* Pain Panel — sub-bots compartidos para grupos */
import { SIN_RUTA } from './http.js'
import { carpetaSesionValida, normalizarTelefono } from './session-ops.js'
import { pedirAccionWorker } from './shared-ipc.js'

const LIMITES_GRUPOS = {
  'free:shared': 3,
  'free:isolated': 4,
  'premium:shared': 5,
  'premium:isolated': 6,
  'vip:shared': 7,
  'vip:isolated': 8,
}

function extraerInvitacion(link) {
  const texto = String(link || '').trim()
  const match = texto.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]+)/i)
  return match ? match[1] : null
}

export function crearRutasShared(ctx) {
  const {
    HttpError, json, leerJson, limitar, puede, requerirCsrf, requerirPermiso,
    requerirUsuario, store, verificarOrigen,
  } = ctx

  async function botDelUsuario(sesion, phone) {
    const limpio = normalizarTelefono(phone) || String(phone || '')
    if (!carpetaSesionValida(limpio)) throw new HttpError(400, 'Sesión inválida.', 'invalid_session')
    const fila = await store.obtenerBotPorPhone(limpio)
    if (!fila) throw new HttpError(404, 'Ese bot no existe.', 'not_found')
    if (Number(fila.user_id) !== Number(sesion.id) && !puede(sesion, 'admin.sessions')) {
      throw new HttpError(403, 'Ese bot no es tuyo.', 'forbidden')
    }
    return { phone: limpio, fila }
  }

  async function limiteGrupos(phone) {
    const fila = await store.obtenerBotPorPhone(phone)
    if (!fila) return LIMITES_GRUPOS['free:shared']
    let tier = 'free'
    let dbMode = 'shared'
    if (fila.server_id) {
      const servidor = await store.obtenerServidor(fila.server_id)
      if (servidor) {
        tier = servidor.tier || 'free'
        dbMode = servidor.db_mode || 'shared'
      }
    }
    return LIMITES_GRUPOS[`${tier}:${dbMode}`] || 3
  }

  return async function rutasShared({ req, res, url, pathname, seg, metodo, ip }) {
    if (seg[0] !== 'api' || seg[1] !== 'shared') return SIN_RUTA

    const sesion = await requerirUsuario(req)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
      requerirCsrf(req, sesion)
      verificarOrigen(req)
    }

    // ── Lista pública de sub-bots compartidos ─────────────────────────────
    if (seg.length === 2 && metodo === 'GET') {
      const shared = await store.listarSharedBotsPublicos()
      const mine = await store.listarSharedBotsUsuario(sesion.id)
      return json(res, 200, {
        shared: shared.map((s) => ({
          id: s.id,
          owner: s.owner_username,
          maxGroups: Number(s.max_groups),
          joined: Number(s.joined_count),
          available: Math.max(0, Number(s.max_groups) - Number(s.joined_count)),
        })),
        mine: mine.map((s) => ({
          id: s.id,
          phone: s.phone,
          maxGroups: Number(s.max_groups),
          maxPerIp: Number(s.max_per_ip),
          active: Boolean(s.active),
          joined: Number(s.joined_count),
        })),
      })
    }

    // ── Mis sub-bots compartidos + solicitudes recibidas ──────────────────
    if (seg.length === 3 && seg[2] === 'mine' && metodo === 'GET') {
      const [bots, joins] = await Promise.all([
        store.listarSharedBotsUsuario(sesion.id),
        store.listarJoinsPorOwner(sesion.id),
      ])
      return json(res, 200, {
        bots: await Promise.all(bots.map(async (s) => ({
          id: s.id,
          phone: s.phone,
          maxGroups: Number(s.max_groups),
          maxPerIp: Number(s.max_per_ip),
          maxAllowed: await limiteGrupos(s.phone),
          active: Boolean(s.active),
          joined: Number(s.joined_count),
        }))),
        joins: joins.map((j) => ({
          id: j.id,
          sharedId: j.shared_id,
          phone: j.owner_phone,
          requester: j.requester_username || 'usuario',
          groupLink: j.group_link,
          groupJid: j.group_jid,
          groupName: j.group_name || '',
          status: j.status,
          createdAt: j.created_at,
        })),
      })
    }

    // ── Publicar un sub-bot ───────────────────────────────────────────────
    if (seg.length === 2 && metodo === 'POST') {
      requerirPermiso(sesion, 'bots.config')
      limitar(req, `shared-create:${sesion.id}`, 20, 60 * 60 * 1000)
      const body = await leerJson(req)
      const { phone, fila } = await botDelUsuario(sesion, body.phone)
      if (fila.status !== 'linked') {
        throw new HttpError(409, 'Vincula y conecta el bot antes de compartirlo.', 'not_linked')
      }
      const maxAllowed = await limiteGrupos(phone)
      const maxGroups = Math.min(Math.max(Number(body.maxGroups) || 3, 1), maxAllowed)
      const maxPerIp = Math.min(Math.max(Number(body.maxPerIp) || 1, 1), 10)
      const bot = await store.crearSharedBot({ userId: sesion.id, phone, maxGroups, maxPerIp })
      await store.registrarAuditoria({ userId: sesion.id, action: 'shared.create', ip, meta: { phone, maxGroups } })
      return json(res, 201, {
        bot: {
          id: bot.id,
          phone: bot.phone,
          maxGroups: Number(bot.max_groups),
          maxPerIp: Number(bot.max_per_ip),
          maxAllowed,
          active: Boolean(bot.active),
        },
      })
    }

    // ── Editar / despublicar ──────────────────────────────────────────────
    if (seg.length === 3 && /^\d+$/.test(seg[2]) && (metodo === 'PATCH' || metodo === 'DELETE')) {
      const id = Number(seg[2])
      const shared = await store.obtenerSharedBot(id)
      if (!shared) throw new HttpError(404, 'Publicación no encontrada.', 'not_found')
      if (Number(shared.user_id) !== Number(sesion.id) && !puede(sesion, 'admin.sessions')) {
        throw new HttpError(403, 'Esa publicación no es tuya.', 'forbidden')
      }
      if (metodo === 'DELETE') {
        await store.eliminarSharedBot(id)
        await store.registrarAuditoria({ userId: sesion.id, action: 'shared.delete', ip, meta: { id } })
        return json(res, 200, { ok: true })
      }
      const body = await leerJson(req)
      const maxAllowed = await limiteGrupos(shared.phone)
      const cambios = {}
      if (body.maxGroups !== undefined) {
        cambios.maxGroups = Math.min(Math.max(Number(body.maxGroups) || 1, 1), maxAllowed)
      }
      if (body.maxPerIp !== undefined) {
        cambios.maxPerIp = Math.min(Math.max(Number(body.maxPerIp) || 1, 1), 10)
      }
      if (body.active !== undefined) cambios.active = body.active === true || body.active === 1
      await store.actualizarSharedBot(id, cambios)
      await store.registrarAuditoria({ userId: sesion.id, action: 'shared.update', ip, meta: { id, cambios } })
      return json(res, 200, { ok: true, maxAllowed })
    }

    // ── Solicitar que el sub-bot se una a un grupo ────────────────────────
    if (seg.length === 4 && /^\d+$/.test(seg[2]) && seg[3] === 'join' && metodo === 'POST') {
      requerirPermiso(sesion, 'bots.link')
      limitar(req, `shared-join:${sesion.id}`, 20, 60 * 60 * 1000)
      const id = Number(seg[2])
      const shared = await store.obtenerSharedBot(id)
      if (!shared || !shared.active) throw new HttpError(404, 'Ese sub-bot no está disponible.', 'not_available')
      if (Number(shared.user_id) === Number(sesion.id)) {
        throw new HttpError(409, 'No puedes unir tu propio sub-bot.', 'own_bot')
      }
      const body = await leerJson(req)
      const invite = extraerInvitacion(body.groupLink)
      if (!invite) throw new HttpError(400, 'El enlace no es una invitación válida de grupo de WhatsApp.', 'invalid_group_link')
      const maxGroups = Math.max(1, Number(shared.max_groups) || 1)
      const activos = await store.contarJoinsActivos(shared.id)
      if (activos >= maxGroups) {
        throw new HttpError(409, 'Ese sub-bot ya alcanzó el máximo de grupos configurado.', 'shared_full')
      }
      const maxPerIp = Math.max(1, Number(shared.max_per_ip) || 1)
      const porIp = await store.contarJoinsPorIp(shared.id, ip)
      if (porIp >= maxPerIp) {
        throw new HttpError(429, 'Ya hay una solicitud de esta IP para este sub-bot. Espera o usa otra red.', 'ip_limit')
      }
      const repetido = await store.contarJoinsRequester(shared.id, sesion.id)
      if (repetido >= 1) {
        throw new HttpError(409, 'Ya pediste este sub-bot para un grupo. Revisa tus solicitudes.', 'already_requested')
      }
      const join = await store.crearSharedJoin({
        sharedId: shared.id,
        requesterId: sesion.id,
        ip,
        groupLink: String(body.groupLink),
        groupName: body.groupName ? String(body.groupName).slice(0, 120) : null,
      })
      const resultado = await pedirAccionWorker('join-group', { folder: shared.phone, link: String(body.groupLink) })
      if (!resultado?.ok) {
        await store.actualizarSharedJoin(join.id, { status: 'rejected' })
        const motivo = resultado?.error === 'not-connected'
          ? 'El sub-bot no está conectado en este momento. Inténtalo de nuevo en unos segundos.'
          : resultado?.error === 'timeout'
            ? 'El sub-bot no respondió a tiempo. Revisa que esté conectado.'
            : 'No se pudo unir al grupo. Verifica que el enlace sea válido y no haya expirado.'
        throw new HttpError(409, motivo, resultado?.error || 'join_failed')
      }
      await store.actualizarSharedJoin(join.id, {
        status: 'joined',
        groupJid: resultado.jid || null,
        groupName: resultado.name || body.groupName || null,
      })
      // Aviso al dueño (push del panel; si no está configurado no rompe nada).
      try {
        const { queuePush } = await import('./push.js')
        await queuePush(store, sesion.id, {
          title: 'Tu sub-bot se unió a un grupo',
          body: `${resultado.name || 'Un grupo'} · solicitado por ${sesion.username || 'un usuario'}`,
          url: '/#/shared',
          userIds: [shared.user_id],
        })
      } catch {}
      await store.registrarAuditoria({
        userId: sesion.id,
        action: 'shared.join',
        ip,
        meta: { sharedId: shared.id, groupJid: resultado.jid || null },
      })
      return json(res, 200, {
        ok: true,
        group: { jid: resultado.jid || null, name: resultado.name || body.groupName || '' },
      })
    }

    // ── Dueño: sacar el bot del grupo / bloquear al solicitante ───────────
    if (seg.length === 5 && seg[2] === 'joins' && /^\d+$/.test(seg[3]) && metodo === 'POST') {
      const joinId = Number(seg[3])
      const join = await store.obtenerSharedJoin(joinId)
      if (!join) throw new HttpError(404, 'Solicitud no encontrada.', 'not_found')
      if (Number(join.owner_id) !== Number(sesion.id) && !puede(sesion, 'admin.sessions')) {
        throw new HttpError(403, 'Esa solicitud no es tuya.', 'forbidden')
      }
      if (seg[4] === 'leave') {
        const resultado = await pedirAccionWorker('leave-group', {
          folder: join.owner_phone,
          jid: join.group_jid,
        })
        await store.actualizarSharedJoin(join.id, { status: 'left' })
        await store.registrarAuditoria({ userId: sesion.id, action: 'shared.leave', ip, meta: { joinId } })
        return json(res, 200, { ok: true, resultado })
      }
      if (seg[4] === 'block') {
        await store.bloquearRequester(join.shared_id, join.requester_id)
        await store.registrarAuditoria({ userId: sesion.id, action: 'shared.block', ip, meta: { joinId } })
        return json(res, 200, { ok: true })
      }
    }

    return SIN_RUTA
  }
}
