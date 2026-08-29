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

const NEWSLETTER_JOIN_QUERY_ID = '24404358912487870'
const NEWSLETTER_JOIN_PATH = 'xwa2_newsletter_join_v2'

export function getChannelFollowEntries() {
  const entries = new Set()

  if (global.ch && typeof global.ch === 'object') {
    for (const value of Object.values(global.ch)) {
      const item = String(value || '').trim()
      if (item) entries.add(item)
    }
  }

  return [...entries]
}

async function newsletterJoinChannel(conn, jid) {
  if (!jid || !conn) return null

  if (typeof conn.query === 'function' && typeof conn.generateMessageTag === 'function') {
    const { S_WHATSAPP_NET, getBinaryNodeChild } = await import('@whiskeysockets/baileys/lib/WABinary/index.js')

    const result = await conn.query({
      tag: 'iq',
      attrs: {
        id: conn.generateMessageTag(),
        type: 'get',
        to: S_WHATSAPP_NET,
        xmlns: 'w:mex'
      },
      content: [
        {
          tag: 'query',
          attrs: { query_id: NEWSLETTER_JOIN_QUERY_ID },
          content: Buffer.from(
            JSON.stringify({ variables: { newsletter_id: jid } }),
            'utf-8'
          )
        }
      ]
    })

    const child = getBinaryNodeChild(result, 'result')
    if (child?.content) {
      const data = JSON.parse(child.content.toString())
      if (data.errors?.length) {
        const message = data.errors.map((err) => err.message || 'Unknown error').join(', ')
        throw new Error(message)
      }
      const response = data?.data?.[NEWSLETTER_JOIN_PATH]
      if (typeof response !== 'undefined') return response
      if (data?.data) return data.data
    }
  }

  if (typeof conn.newsletterFollow === 'function') {
    return conn.newsletterFollow(jid)
  }

  return null
}

function isAlreadyFollowingError(err) {
  const msg = String(err?.message || err || '').toLowerCase()
  return msg.includes('unexpected response structure')
    || msg.includes('already')
    || msg.includes('ya sigues')
}

export async function resolveChannelJid(conn, input) {
  if (!input) return null
  const raw = String(input).trim()
  if (isNewsletterJid(raw)) return raw

  if (_resolvedChannelJids.has(raw)) return _resolvedChannelJids.get(raw)

  let jid = null
  try {
    const resolved = await resolveNewsletter(conn, raw)
    jid = resolved?.jid || null
  } catch {}

  if (!jid && global.idcanal && parseChannelInput(raw)?.type === 'invite') {
    jid = global.idcanal
  }

  if (jid) _resolvedChannelJids.set(raw, jid)
  return jid
}

export async function followConfiguredChannels(conn) {
  if (!conn) return

  const entries = getChannelFollowEntries()
  if (!entries.length && !global.idcanal) return

  const botLabel = conn.user?.id?.split('@')[0] || conn.user?.jid?.split('@')[0] || 'bot'
  const jids = new Set()

  for (const entry of entries) {
    const jid = await resolveChannelJid(conn, entry)
    if (jid) jids.add(jid)
  }

  if (!jids.size && global.idcanal) jids.add(global.idcanal)
  if (!jids.size) return

  for (const jid of jids) {
    try {
      await newsletterJoinChannel(conn, jid)
      console.log(`[canal] +${botLabel} siguiendo: ${jid}`)
    } catch (err) {
      if (isAlreadyFollowingError(err)) {
        console.log(`[canal] +${botLabel} ya sigue: ${jid}`)
        continue
      }
      console.error(`[canal] Error al seguir ${jid}:`, err?.message || err)
    }
  }
}
