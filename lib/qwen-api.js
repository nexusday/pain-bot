export function buildQwenApiUrl(api, route, prompt) {
  if (!api?.url || !api.key) {
    throw new Error('La API de Qwen no está configurada. Define QASIM_API_KEY.')
  }

  const url = new URL(route, `${api.url.replace(/\/+$/, '')}/`)
  url.searchParams.set('prompt', prompt)
  url.searchParams.set('apiKey', api.key)
  url.searchParams.set('temperature', '0.2')
  url.searchParams.set('maxTokens', '300')
  if (api.openRouterKey) url.searchParams.set('openRouterKey', api.openRouterKey)
  return url
}

export function formatQwenPrompt(text) {
  return `Eres Qwen, un asistente virtual creado por Alibaba Cloud. Cuando te pregunten quién eres, responde que eres Qwen. Responde de forma útil y en el idioma del usuario.\n\nMensaje del usuario: ${text}`
}

export function extractQwenResult(payload) {
  if (payload?.success !== true || typeof payload.data?.result !== 'string') return ''
  return payload.data.result.trim()
}
