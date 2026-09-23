/**
 * Anti-Estados: borra la tarjeta del grupo cuando alguien
 * menciona el grupo en su estado de WhatsApp.
 */

function obtenerPayload(m) {
  return m?.message || m?.msg || null
}

function clavesMensaje(payload) {
  if (!payload || typeof payload !== 'object') return []
  return Object.keys(payload).filter(
    k => k !== 'senderKeyDistributionMessage' && k !== 'messageContextInfo'
  )
}

function contextInfoDe(m, payload) {
  if (m?.msg?.contextInfo) return m.msg.contextInfo
  if (!payload || typeof payload !== 'object') return null
  for (const clave of Object.keys(payload)) {
    if (clave === 'messageContextInfo' || clave === 'senderKeyDistributionMessage') continue
    const ctx = payload[clave]?.contextInfo
    if (ctx) return ctx
  }
  return payload.messageContextInfo || null
}

export function esMencionEstadoGrupo(m) {
  if (!m?.isGroup) return false

  const payload = obtenerPayload(m)
  const mtype = String(m.mtype || '')
  const claves = clavesMensaje(payload)

  if (/groupStatusMention|statusMention|statusNotification|groupStatusMessage/i.test(mtype)) {
    return true
  }

  if (
    claves.some(k =>
      /groupStatusMentionMessage|statusMentionMessage|statusNotificationMessage|groupStatusMessage|statusAddYours/i.test(
        k
      )
    )
  ) {
    return true
  }

  if (payload?.groupStatusMentionMessage || payload?.statusMentionMessage) return true
  if (payload?.statusNotificationMessage) return true
  if (payload?.groupStatusMessage) return true

  const ctx = contextInfoDe(m, payload)
  if (ctx?.isGroupStatus === true) return true
  if (ctx?.statusMentionMessageInfo) return true
  if (Array.isArray(ctx?.statusMentions) && ctx.statusMentions.length) return true
  if (Array.isArray(ctx?.statusMentionSources) && ctx.statusMentionSources.length) return true

  const atrib = ctx?.statusAttributions || ctx?.statusAttribution
  if (atrib) {
    const lista = Array.isArray(atrib) ? atrib : [atrib]
    if (lista.some(a => a?.groupStatus || a?.type === 4 || a?.type === 'STATUS_MENTION')) {
      return true
    }
  }

  return false
}

export async function manejarAntiEstados(m, conn, esAdmin) {
  if (!m?.isGroup) return false
  if (!global.db?.data?.antiEstados?.[m.chat]) return false
  if (m.fromMe) return false
  if (esAdmin) return false
  if (!esMencionEstadoGrupo(m)) return false

  try {
    await conn.sendMessage(m.chat, { delete: m.key })
    return true
  } catch (e) {
    console.error('[antiestados]', e?.message || e)
    return false
  }
}

export {
  manejarAntiEstados as handleAntiStatus,
  esMencionEstadoGrupo as isGroupStatusMention
}
