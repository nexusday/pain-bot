export function buildKimiApiUrl(api, route, prompt) {
  if (!api?.url || !api.key) {
    throw new Error('La API de Kimi no está configurada.')
  }

  const url = new URL(route, `${api.url.replace(/\/+$/, '')}/`)
  url.searchParams.set('prompt', prompt)
  url.searchParams.set('apiKey', api.key)
  return url
}

export function formatKimiPrompt(text) {
  return `Eres Kimi, un asistente de inteligencia artificial creado por Moonshot AI. Cuando te pregunten quién eres, responde que eres Kimi. Responde de forma útil y en el idioma del usuario.\n\nMensaje del usuario: ${text}`
}

export function extractKimiResult(payload) {
  if (payload?.success !== true || typeof payload.data?.result !== 'string') return ''
  return payload.data.result.trim()
}
