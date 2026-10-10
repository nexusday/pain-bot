import fetch from "node-fetch"
import yts from "yt-search"
import { probarProveedoresAudio } from "../lib/audio-provider-fallback.js"
import { crearVerificadorApi } from "../lib/api-health.js"

const apiDisponible = crearVerificadorApi({ fetchImpl: fetch })

function nombreAutor(autor) {
  if (!autor) return '—'
  if (typeof autor === 'string') return autor.trim() || '—'
  return autor.name || autor.channel || '—'
}

function baseApi() {
  return (global.APIs?.delirius?.url || "https://api.delirius.online").replace(/\/$/, "")
}

function espera(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

function pareceHtml(texto) {
  const limpio = String(texto || "").trim()
  return !limpio || limpio[0] === "<" || /^<!doctype/i.test(limpio)
}

async function pedirJson(url, { timeoutMs = 7_000, intentos = 1 } = {}) {
  for (let intento = 0; intento < intentos; intento++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)

    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          accept: "application/json",
          "user-agent": "Mozilla/5.0"
        }
      })

      const texto = await res.text()

      if (pareceHtml(texto)) {
        if (intento + 1 < intentos) {
          await espera(800 * (intento + 1))
        }
        continue
      }

      return JSON.parse(texto)

    } catch {
      if (intento + 1 < intentos) {
        await espera(800 * (intento + 1))
      }
    } finally {
      clearTimeout(timer)
    }
  }

  return null
}

async function buscarCancion(text) {
  const disponible = await apiDisponible(baseApi())

  const json = disponible
    ? await pedirJson(
        `${baseApi()}/search/ytsearch?q=${encodeURIComponent(text)}`,
        { timeoutMs: 5_000 }
      )
    : null

  const primero =
    json?.status && Array.isArray(json.data)
      ? json.data[0]
      : null

  if (primero?.url || primero?.videoId) {
    return {
      url: primero.url || `https://youtu.be/${primero.videoId}`,
      titulo: primero.title || "Desconocido",
      autor: primero.author || { name: "Desconocido" },
      duracion: primero.duration || "Desconocido",
      portada: primero.image || primero.thumbnail
    }
  }

  const busqueda = await yts(text).catch(() => null)
  const video = busqueda?.videos?.[0]

  if (!video?.url) return null

  return {
    url: video.url,
    titulo: video.title || "Desconocido",
    autor: video.author || { name: "Desconocido" },
    duracion: video.timestamp || "Desconocido",
    portada: video.thumbnail || video.image
  }
}

async function urlEsAudio(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5_000)

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: {
        range: "bytes=0-1",
        "user-agent": "Mozilla/5.0"
      }
    })

    const tipo = res.headers.get("content-type") || ""

    if (/text\/html|text\/plain/i.test(tipo)) {
      return false
    }

    const cuerpo = res.body

    if (!cuerpo) {
      return false
    }

    const primerChunk =
      await cuerpo[Symbol.asyncIterator]().next()

    cuerpo.destroy()

    const trozo = Buffer
      .from(primerChunk.value || [])
      .subarray(0, 24)
      .toString("utf8")

    if (pareceHtml(trozo)) {
      return false
    }

    return res.ok || res.status === 206

  } catch {
    return false

  } finally {
    clearTimeout(timer)
  }
}

async function pedirAudio(urlVideo, consultaKronix = null) {
  /*
   * ============================
   * API ALEX
   * ============================
   */

  const apiAlex = global.APIs?.alex

  const urlAlex = (
    apiAlex?.url ||
    "https://alex-api-scraper2-1.onrender.com"
  ).replace(/\/$/, "")

  const consultaAlex =
    new URL(`${urlAlex}/api/v1/download/youtube-mp3`)

  consultaAlex.searchParams.set("q", urlVideo)

  if (apiAlex?.key) {
    consultaAlex.searchParams.set(
      "apikey",
      apiAlex.key
    )
  }

  /*
   * ============================
   * API ABZTECH
   * ============================
   */

  const apiAbz =
    "https://api-abztech.zone.id"

  /*
   * ============================
   * FALLBACK DE PROVEEDORES
   *
   * 1. Kronix
   * 2. Delirius
   * 3. Alex
   * 4. ABZTech
   * ============================
   */

  return probarProveedoresAudio(
    [
      /*
       * ========================================
       * PROVEEDOR 1: KRONIX
       *
       * Respuesta esperada:
       *
       * {
       *   "status": true,
       *   "creador": "Sunkovv",
       *   "query": "amapolas",
       *   "resultado": {
       *     "titulo": "...",
       *     "autor": "...",
       *     "miniatura": "...",
       *     "duracion": "3:31",
       *     "duracion_segundos": 211,
       *     "calidad": "MP3 320kbps",
       *     "tipo": "audio/mpeg",
       *     "url": "https://...mp3"
       *   }
       * }
       * ========================================
       */

      {
        nombre: "Kronix",

        obtener: async () => {
          const apiKronix =
            global.APIs?.kronix

          const baseKronix = (
            apiKronix?.url ||
            "https://kronix-apis.nexcodea.com"
          ).replace(/\/$/, "")

          const consulta =
            new URL(`${baseKronix}/api/download/ytmp3`)

          consulta.searchParams.set(
            "query",
            consultaKronix || urlVideo
          )

          if (apiKronix?.key) {
            consulta.searchParams.set(
              "apikey",
              apiKronix.key
            )
          }

          const json = await pedirJson(
            consulta.toString(),
            {
              timeoutMs: 20_000
            }
          )

          const resultado =
            json?.status === true
              ? json.resultado
              : null

          const urlAudio =
            resultado?.url

          if (
            typeof urlAudio !== "string" ||
            pareceHtml(urlAudio) ||
            !(await urlEsAudio(urlAudio))
          ) {
            return null
          }

          return {
            urlAudio,

            datos: {
              title:
                resultado.titulo,

              author:
                resultado.autor,

              image:
                resultado.miniatura,

              duration:
                resultado.duracion,

              quality:
                resultado.calidad,

              format:
                resultado.tipo
            }
          }
        }
      },

      /*
       * ========================================
       * PROVEEDOR 2: DELIRIUS
       * ========================================
       */

      {
        nombre: "Delirius",

        disponible: () =>
          apiDisponible(baseApi()),

        obtener: async () => {
          const json = await pedirJson(
            `${baseApi()}/download/ytmp3?url=${encodeURIComponent(urlVideo)}`,
            {
              timeoutMs: 7_000
            }
          )

          const datos =
            json?.status
              ? json.data
              : null

          const urlAudio =
            typeof datos?.download === "string"
              ? datos.download
              : datos?.download?.url

          if (
            !urlAudio ||
            pareceHtml(urlAudio) ||
            !(await urlEsAudio(urlAudio))
          ) {
            return null
          }

          return {
            datos,
            urlAudio
          }
        }
      },

      /*
       * ========================================
       * PROVEEDOR 3: ALEX
       * ========================================
       */

      {
        nombre: "Alex",

        obtener: async () => {
          const json = await pedirJson(
            consultaAlex.toString(),
            {
              timeoutMs: 15_000
            }
          )

          const resultado =
            json?.status === true
              ? json.result
              : null

          const urlAudio =
            resultado?.audio_url

          if (
            typeof urlAudio !== "string" ||
            pareceHtml(urlAudio) ||
            !(await urlEsAudio(urlAudio))
          ) {
            return null
          }

          return {
            urlAudio,

            datos: {
              title: resultado.titulo,
              author: resultado.autor,
              image: resultado.miniatura,
              format: resultado.formato,
              quality: resultado.calidad
            }
          }
        }
      },

      /*
       * ========================================
       * PROVEEDOR 4: ABZTECH
       * ========================================
       */

      {
        nombre: "ABZTech",

        obtener: async () => {
          const consulta =
            new URL(`${apiAbz}/download/ytmp3`)

          consulta.searchParams.set(
            "url",
            urlVideo
          )

          const json = await pedirJson(
            consulta.toString(),
            {
              timeoutMs: 20_000
            }
          )

          /*
           * Respuesta esperada:
           *
           * {
           *   "status": true,
           *   "created_by": "Febry Wesker",
           *   "backend": "savetube",
           *   "download": {
           *     "title": "...",
           *     "thumbnail": "...",
           *     "duration": "...",
           *     "downloadUrl": "...",
           *     "format": "mp3"
           *   }
           * }
           */

          const descarga =
            json?.status === true
              ? json.download
              : null

          const urlAudio =
            descarga?.downloadUrl

          if (
            typeof urlAudio !== "string" ||
            pareceHtml(urlAudio) ||
            !(await urlEsAudio(urlAudio))
          ) {
            return null
          }

          return {
            urlAudio,

            datos: {
              title:
                descarga.title,

              author:
                "YouTube",

              image:
                descarga.thumbnail,

              duration:
                descarga.duration,

              format:
                descarga.format,

              quality:
                descarga.quality
            }
          }
        }
      }

    ],

    /*
     * ============================
     * LOG DE FALLBACK
     * ============================
     */

    (proveedor, error) => {
      console.warn(
        `[play] Falló proveedor ${proveedor}; probando el siguiente:`,
        error?.message || error
      )
    }
  )
}

const handler = async (
  m,
  { conn, text, usedPrefix }
) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(
        m.chat,
        {
          text:
            `[❗] Falta la canción o el enlace.\n\n` +
            `> *Ejemplo:* ${usedPrefix}play <nombre o link>`,

          contextInfo: {
            ...rcanal?.contextInfo
          }
        },
        {
          quoted: m
        }
      )
    }

    const citado =
      m.mtype === "interactiveResponseMessage"
        ? null
        : m

    const enlace =
      (
        String(text).match(
          /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/\S+|youtu\.be\/\S+)/i
        ) || [""]
      )[0]

    let urlVideo

    let titulo =
      "Desconocido"

    let autor = {
      name: "Desconocido"
    }

    let duracion =
      "Desconocido"

    let urlMiniatura

    /*
     * ============================
     * LINK DIRECTO
     * ============================
     */

    if (enlace) {
      urlVideo = enlace

    /*
     * ============================
     * SELECCIÓN POR NÚMERO
     * ============================
     */

    } else if (/^\d+$/.test(text.trim())) {
      const indice =
        parseInt(text.trim(), 10) - 1

      const cacheBusqueda =
        global.lastYtSearch?.[m.sender]

      if (
        !cacheBusqueda?.results?.length ||
        Date.now() - cacheBusqueda.at >
          10 * 60 * 1000
      ) {
        throw (
          `[❗] No hay búsqueda reciente. ` +
          `Usa primero *${usedPrefix}yt <texto>*`
        )
      }

      if (
        indice < 0 ||
        indice >= cacheBusqueda.results.length
      ) {
        throw (
          `[❗] Elige un número del 1 al ` +
          `${cacheBusqueda.results.length}.`
        )
      }

      const elegido =
        cacheBusqueda.results[indice]

      urlVideo =
        elegido.url

      titulo =
        elegido.title ||
        titulo

      autor = {
        name:
          elegido.author ||
          "Desconocido"
      }

      duracion =
        elegido.duration ||
        duracion

      urlMiniatura =
        elegido.image

    /*
     * ============================
     * BÚSQUEDA NORMAL
     * ============================
     */

    } else {
      const encontrado =
        await buscarCancion(text)

      if (!encontrado) {
        throw "sin resultados"
      }

      urlVideo =
        encontrado.url

      titulo =
        encontrado.titulo ||
        titulo

      autor =
        encontrado.autor ||
        autor

      duracion =
        encontrado.duracion ||
        duracion

      urlMiniatura =
        encontrado.portada
    }

    /*
     * ============================
     * DESCARGAR AUDIO
     * ============================
     * Kronix acepta texto o link en "query": se le pasa el texto
     * original cuando hay búsqueda, si no el video ya resuelto.
     */

    const consultaKronix =
      !enlace && !/^\d+$/.test(text.trim())
        ? text.trim()
        : urlVideo

    const audio =
      await pedirAudio(urlVideo, consultaKronix)

    if (!audio?.urlAudio) {
      throw "no se pudo obtener el audio"
    }

    const datosInfo =
      audio.datos || {}

    const urlAudio =
      audio.urlAudio

    const portada =
      datosInfo.image ||
      urlMiniatura

    titulo =
      datosInfo.title ||
      titulo

    autor =
      datosInfo.author ||
      datosInfo.channel ||
      autor

    duracion =
      datosInfo.duration ||
      datosInfo.timestamp ||
      duracion

    /*
     * ============================
     * INFORMACIÓN
     * ============================
     */

    const canal =
      nombreAutor(autor)

    const informacion = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${titulo || "audio"}*
╰─ ✧  ✩
┊ canal  ·  \`${canal}\`
┊ duración  ·  \`${duracion || "—"}\`
┊ \`${urlVideo || "—"}\`
╰─────────`.trim()

    /*
     * ============================
     * ENVIAR MINIATURA
     * ============================
     */

    let envioPortada = false

    if (portada) {
      try {
        const miniatura =
          (await conn.getFile(portada)).data

        await conn.sendMessage(
          m.chat,
          {
            image: miniatura,
            caption: informacion,

            contextInfo: {
              ...rcanal?.contextInfo
            }
          },
          {
            quoted: citado
          }
        )

        envioPortada = true

      } catch {}
    }

    /*
     * ============================
     * SI NO HAY MINIATURA
     * ============================
     */

    if (!envioPortada) {
      await conn.sendMessage(
        m.chat,
        {
          text: informacion,

          contextInfo: {
            ...rcanal?.contextInfo
          }
        },
        {
          quoted: citado
        }
      )
    }

    /*
     * ============================
     * ENVIAR MP3
     * ============================
     */

    await conn.sendMessage(
      m.chat,
      {
        audio: {
          url: urlAudio
        },

        fileName:
          `${titulo}.mp3`,

        mimetype:
          "audio/mpeg"
      },
      {
        quoted: citado
      }
    )

  } catch (e) {
    const crudo =
      typeof e === "string"
        ? e
        : (
            e?.message ||
            "no se pudo descargar"
          )

    const detalle =
      /DOCTYPE|Unexpected token|not valid JSON|is not valid JSON/i.test(
        crudo
      )
        ? "no se pudo obtener el audio"
        : crudo

    return conn.sendMessage(
      m.chat,
      {
        text:
          `[❌] ${detalle}\n\n` +
          `> *Ejemplo:* ${usedPrefix}play <nombre o link>`,

        contextInfo: {
          ...rcanal?.contextInfo
        }
      },
      {
        quoted: m
      }
    )
  }
}

handler.command = [
  "play",
  "ytmp3",
  "playaudio"
]

handler.tags = [
  "descargas"
]

handler.group = true

export default handler

function formatearVistas(views) {
  if (views === undefined) {
    return "No disponible"
  }

  if (views >= 1_000_000_000) {
    return `${(
      views / 1_000_000_000
    ).toFixed(1)}B (${views.toLocaleString()})`
  }

  if (views >= 1_000_000) {
    return `${(
      views / 1_000_000
    ).toFixed(1)}M (${views.toLocaleString()})`
  }

  if (views >= 1_000) {
    return `${(
      views / 1_000
    ).toFixed(1)}k (${views.toLocaleString()})`
  }

  return views.toString()
}
