export function buildTextEffectUrl(api, route, text1, text2) {
  if (!api?.url || !api.key) {
    throw new Error('La API global de Qasim no está configurada.')
  }

  const url = new URL(route, `${api.url.replace(/\/+$/, '')}/`)
  url.searchParams.set('apiKey', api.key)
  url.searchParams.set('text1', text1)
  url.searchParams.set('text2', text2)
  return url
}

export function buildTextproUrl(api, route, text1, text2) {
  return buildTextEffectUrl(api, route, text1, text2)
}

export function extractImageUrl(payload, { requireStatus = false } = {}) {
  if (payload?.success !== true || (requireStatus && payload.data?.status !== true)) return ''

  const imageUrl = payload.data?.image_url
  if (typeof imageUrl !== 'string') return ''

  try {
    const url = new URL(imageUrl)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

export function extractTextproImage(payload) {
  return extractImageUrl(payload, { requireStatus: true })
}
