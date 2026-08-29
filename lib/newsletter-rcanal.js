/**
 * Utilidades para canales / newsletters de WhatsApp y global.rcanal
 */

const NEWSLETTER_SUFFIX = '@newsletter'

export function isNewsletterJid(jid) {
  return typeof jid === 'string' && jid.endsWith(NEWSLETTER_SUFFIX)
}

export function normalizeNewsletterJid(id) {
  if (!id) return ''
  const raw = String(id).trim()
  if (!raw) return ''
  return raw.includes('@') ? raw : `${raw}${NEWSLETTER_SUFFIX}`
}

export function parseChannelInput(input) {
  if (!input) return null
  const value = String(input).trim()
  if (!value) return null

  if (isNewsletterJid(value)) return { type: 'jid', key: value }

  const urlMatch = value.match(/(?:whatsapp\.com|wa\.me)\/channel\/([A-Za-z0-9_-]+)/i)
  if (urlMatch) return { type: 'invite', key: urlMatch[1] }

  if (/^[A-Za-z0-9_-]{10,}$/.test(value) && !value.includes('@')) {
    return { type: 'invite', key: value }
  }

  const digits = value.replace(/\D/g, '')
  if (digits.length >= 12) {
    return { type: 'jid', key: `${digits}${NEWSLETTER_SUFFIX}` }
  }

  return null
}

function getMessagePayload(m) {
  return m?.message || m?.msg || {}
}

function getContextInfoFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null

  for (const key of Object.keys(payload)) {
    if (key === 'messageContextInfo' || key === 'senderKeyDistributionMessage') continue
    const ctx = payload[key]?.contextInfo
    if (ctx) return ctx
  }

  return payload.messageContextInfo || null
}

export function extractNewsletterFromMessage(m) {
  const result = { jid: null, name: null, source: null }
  if (!m) return result

  const chat = m.chat || m.key?.remoteJid || ''
  if (isNewsletterJid(chat)) {
    result.jid = chat
    result.source = 'chat'
  }

  const payload = getMessagePayload(m)

  const comment = payload.commentMessage || payload.encCommentMessage
  const commentJid = comment?.targetMessageKey?.remoteJid
  if (isNewsletterJid(commentJid)) {
    result.jid = commentJid
    result.source = 'comment'
  }

  const contextInfo = getContextInfoFromPayload(payload)
  const forwarded = contextInfo?.forwardedNewsletterMessageInfo
  if (forwarded?.newsletterJid) {
    result.jid = forwarded.newsletterJid
    result.name = forwarded.newsletterName || result.name
    result.source = result.source || 'forwarded'
  }

  if (contextInfo?.commentParentKey?.remoteJid && isNewsletterJid(contextInfo.commentParentKey.remoteJid)) {
    result.jid = contextInfo.commentParentKey.remoteJid
    result.source = result.source || 'commentParent'
  }

  return result
}

export function buildRcanal(jid = '', name = '') {
  return {
    contextInfo: {
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: jid,
        serverMessageId: 100,
        newsletterName: name || 'Canal'
      }
    }
  }
}

export function formatCanalConfig(jid, name = '') {
  const safeName = String(name || 'Canal').replace(/'/g, "\\'")
  return `global.canal = {\n  jid: '${jid}',\n  name: '${safeName}'\n}`
}

function readCanalConfig() {
  const canal = global.canal
  let jid = ''
  let name = global.canalName || ''
  let invite = ''

  if (!canal) {
    return { jid, name, invite }
  }

  if (typeof canal === 'string') {
    const parsed = parseChannelInput(canal)
    if (parsed?.type === 'jid') jid = normalizeNewsletterJid(parsed.key)
    else if (parsed?.type === 'invite') invite = parsed.key
  } else if (typeof canal === 'object') {
    jid = normalizeNewsletterJid(canal.jid || canal.id || '')
    name = canal.name || name
    invite = canal.invite || ''
    if (!jid && !invite && canal.link) {
      const parsed = parseChannelInput(canal.link)
      if (parsed?.type === 'jid') jid = normalizeNewsletterJid(parsed.key)
      else if (parsed?.type === 'invite') invite = parsed.key
    }
    if (!jid && !invite && canal.url) {
      const parsed = parseChannelInput(canal.url)
      if (parsed?.type === 'jid') jid = normalizeNewsletterJid(parsed.key)
      else if (parsed?.type === 'invite') invite = parsed.key
    }
  }

  return { jid, name, invite }
}

export function syncRcanalFromConfig() {
  const { jid, name, invite } = readCanalConfig()

  global.idcanal = jid
  global.namecanal = name
  global.rcanal = buildRcanal(jid, name)
  global._canalInvitePending = invite || ''

  if (jid) {
    console.log(`[canal] rcanal cargado: ${jid}${name ? ` (${name})` : ''}`)
  }
}

export async function resolveNewsletter(conn, input) {
  const parsed = parseChannelInput(input)
  if (!parsed) return null

  if (typeof conn?.newsletterMetadata !== 'function') {
    if (parsed.type === 'jid') {
      return { jid: normalizeNewsletterJid(parsed.key), name: '' }
    }
    return null
  }

  const meta = await conn.newsletterMetadata(parsed.type, parsed.key)
  if (!meta?.id) return null

  const jid = normalizeNewsletterJid(meta.id)
  const name = meta.name || meta.thread_metadata?.name || ''
  return {
    jid,
    name,
    invite: meta.invite || '',
    subscribers: meta.subscribers
  }
}

export async function resolveCanalConfig(conn) {
  const pendingInvite = global._canalInvitePending
  if (pendingInvite && typeof conn?.newsletterMetadata === 'function') {
    try {
      const resolved = await resolveNewsletter(conn, pendingInvite)
      if (resolved?.jid) {
        global.idcanal = resolved.jid
        global.namecanal = resolved.name || global.namecanal || 'Canal'
        global.rcanal = buildRcanal(global.idcanal, global.namecanal)
        global._canalInvitePending = ''
        console.log(`[canal] Invite resuelto: ${global.idcanal} (${global.namecanal})`)
      }
    } catch (err) {
      console.error('[canal] No se pudo resolver el invite del config:', err?.message || err)
    }
  }

  if (global.idcanal && !global.namecanal && typeof conn?.newsletterMetadata === 'function') {
    try {
      const resolved = await resolveNewsletter(conn, global.idcanal)
      if (resolved?.name) {
        global.namecanal = resolved.name
        global.rcanal = buildRcanal(global.idcanal, global.namecanal)
      }
    } catch {}
  }

  await followConfiguredChannels(conn)
}

const _resolvedChannelJids = new Map()

export function getChannelFollowEntries() {
  const entries = new Set()

  if (global.ch && typeof global.ch === 'object') {
    for (const value of Object.values(global.ch)) {
      const item = String(value || '').trim()
      if (item) entries.add(item)
    }
  }

  const { jid, invite } = readCanalConfig()
  if (jid) entries.add(jid)
  else if (invite) entries.add(invite)

  return [...entries]
}

export async function resolveChannelJid(conn, input) {
  if (!input) return null
  const raw = String(input).trim()
  if (isNewsletterJid(raw)) return raw

  if (_resolvedChannelJids.has(raw)) return _resolvedChannelJids.get(raw)

  const resolved = await resolveNewsletter(conn, raw)
  const jid = resolved?.jid || null
  if (jid) _resolvedChannelJids.set(raw, jid)
  return jid
}

export async function followConfiguredChannels(conn) {
  if (!conn || typeof conn.newsletterFollow !== 'function') return

  const entries = getChannelFollowEntries()
  if (!entries.length) return

  const botLabel = conn.user?.id?.split('@')[0] || conn.user?.jid?.split('@')[0] || 'bot'

  for (const entry of entries) {
    try {
      const jid = await resolveChannelJid(conn, entry)
      if (!jid) {
        console.error(`[canal] No se pudo resolver para seguir: ${entry}`)
        continue
      }
      await conn.newsletterFollow(jid)
      console.log(`[canal] +${botLabel} siguiendo: ${jid}`)
    } catch (err) {
      console.error(`[canal] Error al seguir ${entry}:`, err?.message || err)
    }
  }
}
