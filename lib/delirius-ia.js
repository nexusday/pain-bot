import axios from 'axios'

const CABECERAS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

export function extraerTextoIa(payload) {
  if (payload == null) return ''
  if (typeof payload === 'string') return payload.trim()
  if (typeof payload !== 'object') return String(payload).trim()

  const candidatos = [
    payload.data,
    payload.data?.result,
    payload.data?.message,
    payload.data?.response,
    payload.data?.text,
    payload.text,
    payload.result,
    payload.message,
    payload.response,
    payload.msg
  ]

  for (const c of candidatos) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
}

export function esRespuestaIaInutil(texto = '') {
  const t = String(texto || '').trim()
  if (!t) return true
  if (/^error:/i.test(t)) return true
  if (/no wiz data/i.test(t)) return true
  if (/no response/i.test(t)) return true
  if (/rate limit/i.test(t)) return true
  if (/refused to respond/i.test(t)) return true
  return false
}

async function getJson(url, timeout = 60000) {
  const { data, status } = await axios.get(url, {
    timeout,
    headers: CABECERAS,
    validateStatus: () => true
  })
  if (status >= 500) throw new Error(`HTTP ${status}`)
  return { data, status }
}

async function viaChatgpt(texto) {
  const { data } = await getJson(
    `https://api.delirius.online/ia/chatgpt?q=${encodeURIComponent(texto)}`
  )
  if (data?.status === false) return ''
  return extraerTextoIa(data)
}

async function viaGptPrompt(texto, systemPrompt) {
  const prompt = systemPrompt || 'Responde de forma clara, útil y en español.'
  const { data } = await getJson(
    `https://api.delirius.online/ia/gptprompt?text=${encodeURIComponent(texto)}&prompt=${encodeURIComponent(prompt)}`
  )
  if (data?.status === false) return ''
  return extraerTextoIa(data)
}

async function viaGemini(texto, systemPrompt) {
  const query = systemPrompt ? `${systemPrompt}\n\n---\nMensaje: ${texto}` : texto
  const { data, status } = await getJson(
    `https://api.delirius.online/ia/gemini?query=${encodeURIComponent(query)}`
  )
  if (status >= 400 || data?.status === false) return ''
  return extraerTextoIa(data)
}

async function viaRipleai(texto) {
  const { data, status } = await getJson(
    `https://api.delirius.online/ia/ripleai?query=${encodeURIComponent(texto)}`,
    35000
  )
  if (status >= 400 || data?.status === false) return ''
  return extraerTextoIa(data)
}


export async function consultarIaDelirius(texto, {
  systemPrompt = '',
  intentosPorProveedor = 2,
  incluirRipleai = false
} = {}) {
  const consulta = String(texto || '').trim()
  if (!consulta) return ''

  const proveedores = [
    { id: 'chatgpt', call: () => viaChatgpt(consulta) },
    { id: 'gptprompt', call: () => viaGptPrompt(consulta, systemPrompt) },
    { id: 'gemini', call: () => viaGemini(consulta, systemPrompt) }
  ]
  if (incluirRipleai) {
    proveedores.unshift({ id: 'ripleai', call: () => viaRipleai(consulta) })
  }

  let ultimoError = ''
  for (const proveedor of proveedores) {
    for (let i = 0; i < intentosPorProveedor; i++) {
      try {
        const out = await proveedor.call()
        if (!esRespuestaIaInutil(out)) return out
        ultimoError = out || `vacío (${proveedor.id})`
      } catch (e) {
        ultimoError = e?.message || String(e)
      }
      if (i < intentosPorProveedor - 1) await sleep(600)
    }
  }

  if (ultimoError) {
    console.warn('[delirius-ia] sin respuesta útil. último:', ultimoError)
  }
  return ''
}

export function formatearPensamiento(respuestaApi = '') {
  let pensamiento = ''
  let respuestaFinal = respuestaApi

  const match = respuestaApi.match(/<think>([\s\S]*?)<\/think>/)
  if (match) {
    pensamiento = match[1].trim()
    respuestaFinal = respuestaApi.replace(/<think>[\s\S]*?<\/think>/, '').trim()
  }

  let out = ''
  if (pensamiento) {
    out += `> *Su pensamiento:* ${pensamiento.replace(/\n+/g, ' ').trim()}\n\n`
  }
  out += respuestaFinal
  return out
}
