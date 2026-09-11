import fetch from 'node-fetch'

const SUBREDDITS_MEMES = [
  'yo_elvr',
  'yoelvr',
  'memesESP',
  'memesESPanol',
  'MemesEnEspanol',
  'memeslatinos',
  'memeslatam',
  'memesenespanol',
  'memes_espanol',
  'memes_en_es',
  'SpanishMeme',
  'memes_mexico'
]

const SUBREDDITS_LATAM = [
  'spain',
  'es',
  'latinoamerica',
  'argentina',
  'mexico',
  'chile',
  'colombia',
  'peru'
]

const SUBREDDITS = [...SUBREDDITS_MEMES, ...SUBREDDITS_LATAM]
const SUBS_COMBINADOS = SUBREDDITS.join('+')
const MAX_INTENTOS = 10
const TIMEOUT_FETCH = 15000

function mezclar(arr) {
  const lista = [...arr]
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]]
  }
  return lista
}

function normalizarMeme(datos) {
  if (!datos || datos.nsfw || datos.spoiler) return null

  const url = (datos.url || '').trim()
  if (!url) return null
  if (/reddit\.com\/gallery|v\.redd\.it|\.mp4$/i.test(url)) return null

  return {
    title: (datos.title || 'Meme').trim().slice(0, 200),
    url,
    subreddit: datos.subreddit || 'memes',
    author: datos.author || 'anon',
    ups: Number(datos.ups) || 0
  }
}

async function obtenerJson(url) {
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_FETCH)

  try {
    const respuesta = await fetch(url, { signal: controlador.signal })
    if (!respuesta.ok) return null
    return await respuesta.json()
  } catch {
    return null
  } finally {
    clearTimeout(temporizador)
  }
}

async function obtenerMeme() {
  const subsMeme = mezclar(SUBREDDITS_MEMES)
  const subsLatam = mezclar(SUBREDDITS_LATAM)
  const orden = [...subsMeme, ...subsLatam]

  for (const sub of orden.slice(0, MAX_INTENTOS)) {
    const datos = await obtenerJson(`https://meme-api.com/gimme/${sub}`)
    const meme = normalizarMeme(datos)
    if (meme) return meme
  }

  const grupos = [
    SUBREDDITS_MEMES.join('+'),
    SUBREDDITS_LATAM.join('+'),
    SUBS_COMBINADOS
  ]

  for (const grupo of grupos) {
    const datos = await obtenerJson(`https://meme-api.com/gimme/${grupo}`)
    const meme = normalizarMeme(datos)
    if (meme) return meme
  }

  return null
}

function esGif(url) {
  return /\.gif(\?|$)/i.test(url)
}

let handler = async (m, { conn }) => {
  try {
    await conn.sendMessage(m.chat, {
      react: { text: '⏳', key: m.key }
    }).catch(() => {})

    const meme = await obtenerMeme()

    if (!meme) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No pude obtener un meme ahora. Intentá de nuevo en unos segundos.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const leyenda = `😂 *${meme.title}*`
    const carga = esGif(meme.url)
      ? {
          video: { url: meme.url },
          gifPlayback: true,
          caption: leyenda,
          contextInfo: { ...rcanal.contextInfo }
        }
      : {
          image: { url: meme.url },
          caption: leyenda,
          contextInfo: { ...rcanal.contextInfo }
        }

    await conn.sendMessage(m.chat, carga, { quoted: m })

    await conn.sendMessage(m.chat, {
      react: { text: '✅', key: m.key }
    }).catch(() => {})

  } catch (e) {
    console.error('Error en comando meme:', e)
    await conn.sendMessage(m.chat, {
      text: '*[❗] Ocurrió un error al buscar el meme. Intentá de nuevo.*',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['.meme']
handler.tags = ['fun']
handler.command = ['meme', 'memes', 'memito', 'memerandom']
export default handler
