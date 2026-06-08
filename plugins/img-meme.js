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
const SUBS_COMBINED = SUBREDDITS.join('+')
const MAX_ATTEMPTS = 10
const FETCH_TIMEOUT = 15000

function shuffle(arr) {
  const list = [...arr]
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

function normalizeMeme(data) {
  if (!data || data.nsfw || data.spoiler) return null

  const url = (data.url || '').trim()
  if (!url) return null
  if (/reddit\.com\/gallery|v\.redd\.it|\.mp4$/i.test(url)) return null

  return {
    title: (data.title || 'Meme').trim().slice(0, 200),
    url,
    subreddit: data.subreddit || 'memes',
    author: data.author || 'anon',
    ups: Number(data.ups) || 0
  }
}

async function fetchJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function getMeme() {
  const memeSubs = shuffle(SUBREDDITS_MEMES)
  const latamSubs = shuffle(SUBREDDITS_LATAM)
  const order = [...memeSubs, ...latamSubs]

  for (const sub of order.slice(0, MAX_ATTEMPTS)) {
    const data = await fetchJson(`https://meme-api.com/gimme/${sub}`)
    const meme = normalizeMeme(data)
    if (meme) return meme
  }

  const pools = [
    SUBREDDITS_MEMES.join('+'),
    SUBREDDITS_LATAM.join('+'),
    SUBS_COMBINED
  ]

  for (const pool of pools) {
    const data = await fetchJson(`https://meme-api.com/gimme/${pool}`)
    const meme = normalizeMeme(data)
    if (meme) return meme
  }

  return null
}

function isGif(url) {
  return /\.gif(\?|$)/i.test(url)
}

let handler = async (m, { conn }) => {
  try {
    await conn.sendMessage(m.chat, {
      react: { text: '⏳', key: m.key }
    }).catch(() => {})

    const meme = await getMeme()

    if (!meme) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No pude obtener un meme ahora. Intentá de nuevo en unos segundos.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const caption = `😂 *${meme.title}*`
    const payload = isGif(meme.url)
      ? {
          video: { url: meme.url },
          gifPlayback: true,
          caption,
          contextInfo: { ...rcanal.contextInfo }
        }
      : {
          image: { url: meme.url },
          caption,
          contextInfo: { ...rcanal.contextInfo }
        }

    await conn.sendMessage(m.chat, payload, { quoted: m })

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
