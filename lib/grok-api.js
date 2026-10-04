export function buildGrokApiUrl(api, route, text) {
  if (!api?.url || !api.key) {
    throw new Error('La API de Grok no está configurada. Define QASIM_API_KEY.')
  }

  const url = new URL(route, `${api.url.replace(/\/+$/, '')}/`)
  url.searchParams.set('text', text)
  url.searchParams.set('apiKey', api.key)
  return url
}

export function formatGrokPrompt(text) {
  return `Eres Grok, el asistente de inteligencia artificial de xAI. Cuando te pregunten quién eres, responde que eres Grok. Responde de forma útil y en el idioma del usuario.\n\nPregunta del usuario: ${text}`
}

export function extractGrokResult(payload) {
  if (payload?.success !== true || typeof payload.data?.result !== 'string') return ''
  return payload.data.result.trim()
}
