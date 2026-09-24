import yts from 'yt-search'
import { join, extname, dirname } from 'path'
import { existsSync, readdirSync, readFileSync, unlinkSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { ejecutarYtDlp } from '../lib/ytdlp.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIR_TMP = join(__dirname, '../tmp')
const MAX_DURACION_SEG = 15 * 60
const REGEX_YT = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/i

function asegurarTmp() {
  if (!existsSync(DIR_TMP)) mkdirSync(DIR_TMP, { recursive: true })
}

function limpiarArchivos(prefijo) {
  try {
    if (!existsSync(DIR_TMP)) return
    for (const nombre of readdirSync(DIR_TMP)) {
      if (!nombre.startsWith(prefijo)) continue
      try { unlinkSync(join(DIR_TMP, nombre)) } catch {}
    }
  } catch {}
}

function extraerIdYouTube(texto = '') {
  const raw = String(texto).trim()
  const corto = raw.match(/youtu\.be\/([\w-]{6,})/i)
  if (corto?.[1]) return corto[1]
  const watch = raw.match(/[?&]v=([\w-]{6,})/i)
  if (watch?.[1]) return watch[1]
  const pathId = raw.match(/youtube\.com\/(?:shorts|embed|live)\/([\w-]{6,})/i)
  if (pathId?.[1]) return pathId[1]
  return null
}

function urlDesdeId(id) {
  return `https://www.youtube.com/watch?v=${id}`
}

function formatearDuracion(segundos) {
  const total = Math.max(0, Math.floor(Number(segundos) || 0))
  if (!total) return 'Desconocido'
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function parsearTimestamp(ts = '') {
  const partes = String(ts).split(':').map(n => Number(n)).filter(n => Number.isFinite(n))
  if (!partes.length) return 0
  if (partes.length === 3) return partes[0] * 3600 + partes[1] * 60 + partes[2]
  if (partes.length === 2) return partes[0] * 60 + partes[1]
  return partes[0]
}

function nombreSeguro(titulo = 'audio') {
  return String(titulo)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'audio'
}

function mimePorArchivo(ruta) {
  const ext = extname(ruta).toLowerCase()
  if (ext === '.mp3') return { mime: 'audio/mpeg', ext: 'mp3' }
  if (ext === '.m4a' || ext === '.mp4' || ext === '.aac') return { mime: 'audio/mp4', ext: 'm4a' }
  if (ext === '.ogg' || ext === '.opus') return { mime: 'audio/ogg; codecs=opus', ext: 'ogg' }
  if (ext === '.webm') return { mime: 'audio/webm', ext: 'webm' }
  return { mime: 'audio/mpeg', ext: 'mp3' }
}

async function resolverVideo(texto) {
  const consulta = String(texto || '').trim()
  if (!consulta) throw '[❗] Ingresa el nombre o enlace de YouTube.'

  const idUrl = extraerIdYouTube(consulta)
  if (idUrl) {
    try {
      const detalle = await yts({ videoId: idUrl })
      if (detalle?.videoId || detalle?.title) {
        return {
          url: detalle.url || urlDesdeId(idUrl),
          title: detalle.title || 'Desconocido',
          author: detalle.author?.name || detalle.author || 'Desconocido',
          duration: Number(detalle.seconds) || parsearTimestamp(detalle.timestamp) || 0,
          timestamp: detalle.timestamp || formatearDuracion(detalle.seconds),
          thumbnail: detalle.image || detalle.thumbnail || null,
        }
      }
    } catch {}

    return {
      url: urlDesdeId(idUrl),
      title: 'Desconocido',
      author: 'Desconocido',
      duration: 0,
      timestamp: 'Desconocido',
      thumbnail: null,
    }
  }

  const busqueda = await yts(consulta)
  const video = busqueda?.videos?.[0]
  if (!video?.url) throw '[❗] No se encontraron resultados para la búsqueda.'

  return {
    url: video.url,
    title: video.title || 'Desconocido',
    author: video.author?.name || video.author || 'Desconocido',
    duration: Number(video.seconds) || parsearTimestamp(video.timestamp),
    timestamp: video.timestamp || formatearDuracion(video.seconds),
    thumbnail: video.image || video.thumbnail || null,
  }
}


async function descargarAudioRapido(url, id) {
  asegurarTmp()
  const plantilla = join(DIR_TMP, `play3_${id}.%(ext)s`)

  await ejecutarYtDlp(url, {
    output: plantilla,
    format: 'bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio/best',
    noPlaylist: true,
    noWarnings: true,
    quiet: true,
    noCheckCertificates: true,
    restrictFilenames: true,
    concurrentFragments: 8,
    retries: 2,
    fragmentRetries: 2,
  })

  const archivo = readdirSync(DIR_TMP)
    .filter(n => n.startsWith(`play3_${id}.`))
    .sort((a, b) => a.length - b.length)[0]

  if (!archivo) throw new Error('yt-dlp no generó el archivo de audio.')
  return join(DIR_TMP, archivo)
}

async function enviarInfo(conn, m, video, informacion) {
  if (video.thumbnail) {
    try {
      await conn.sendMessage(m.chat, {
        image: { url: video.thumbnail },
        caption: informacion,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
      return
    } catch {}
  }
  await conn.sendMessage(m.chat, {
    text: informacion,
    contextInfo: { ...(global.rcanal?.contextInfo || {}) },
  }, { quoted: m }).catch(() => {})
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  let rutaAudio = ''

  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. Uso: *${usedPrefix}${command} <búsqueda o url>*\n> Ej: *${usedPrefix}${command} unstoppable*\n> Ej: *${usedPrefix}${command} https://youtu.be/...*`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

    const video = await resolverVideo(text)

    if (video.duration > MAX_DURACION_SEG) {
      throw `[❗] El audio dura *${video.timestamp}* (máx. 15 min).`
    }

    const informacion = `ִֶָ☾. 𝗣𝗹𝗮𝘆𝟯 ִֶָ☾.
 𓍯  *Título:* ${video.title}
 𓍯  *Canal:* ${video.author}
 𓍯  *Duración:* ${video.timestamp}
 𓍯  *Enlace:* ${video.url}`

   
    const promesaDescarga = descargarAudioRapido(video.url, id)
    const promesaInfo = enviarInfo(conn, m, video, informacion)

    ;[rutaAudio] = await Promise.all([promesaDescarga, promesaInfo])

    const buffer = readFileSync(rutaAudio)
    if (!buffer?.length) throw new Error('El archivo de audio está vacío.')

    const { mime, ext } = mimePorArchivo(rutaAudio)

    await conn.sendMessage(m.chat, {
      audio: buffer,
      fileName: `${nombreSeguro(video.title)}.${ext}`,
      mimetype: mime,
      ptt: false,
    }, { quoted: m })

    conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
  } catch (e) {
    console.error('Error en play3:', e)
    conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
    await conn.sendMessage(m.chat, {
      text: typeof e === 'string'
        ? e
        : e?.code === 'ENOENT'
          ? '[❌] Falta *yt-dlp* en el servidor. Reinicia el bot (se descarga solo) o instálalo en el VPS.'
          : `[❌] No se pudo descargar.\n> ${e?.stderr || e?.message || e}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  } finally {
    if (rutaAudio && existsSync(rutaAudio)) {
      try { unlinkSync(rutaAudio) } catch {}
    }
    limpiarArchivos(`play3_${id}`)
  }
}

handler.command = ['play3', 'music3', 'song3', 'ytdlp']
handler.tags = ['descargas']
handler.help = ['play3 <búsqueda/url>']
handler.group = true

export default handler
