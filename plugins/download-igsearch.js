import fetch from 'node-fetch'

const LIMITE_RESULTADOS = 4

function recortarTexto(text = '', max = 120) {
  const valor = String(text).replace(/\s+/g, ' ').trim()
  if (!valor) return ''
  return valor.length > max ? `${valor.slice(0, max - 1)}…` : valor
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Ingresa un texto para buscar reels de Instagram.\n\n> *Ejemplo:*\n${usedPrefix + command} its you`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const consulta = text.trim()

   

    const urlBusqueda = `https://api.delirius.online/search/instagramreels?query=${encodeURIComponent(consulta)}&language=es`
    const resBusqueda = await fetch(urlBusqueda).then(r => r.json())

    if (!resBusqueda?.status || !Array.isArray(resBusqueda.data) || !resBusqueda.data.length) {
      throw '[❗] No se encontraron reels para esa búsqueda.'
    }

    const resultados = resBusqueda.data.slice(0, LIMITE_RESULTADOS)

    let lista = `*Resultados de Instagram*\n\n> *Búsqueda:* ${consulta}\n> *Encontrados:* ${resultados.length}\n\n`
    resultados.forEach((elemento, i) => {
      lista += `*${i + 1}.* ${recortarTexto(elemento.title, 80)}\n> ${elemento.url}\n\n`
    })
    lista += `> Para descargar usa:\n> ${usedPrefix}ig <enlace>`

    await conn.sendMessage(m.chat, {
      text: lista.trim(),
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })

    for (let i = 0; i < resultados.length; i++) {
      const elemento = resultados[i]
      const leyenda = `*${i + 1}.* ${recortarTexto(elemento.title, 100)}\n\n${recortarTexto(elemento.description, 160)}\n\n> ${elemento.url}\n\n> Descargar: ${usedPrefix}ig ${elemento.url}`

      if (elemento.image) {
        try {
          const miniatura = (await conn.getFile(elemento.image)).data
          await conn.sendMessage(m.chat, {
            image: miniatura,
            caption: leyenda,
            contextInfo: { ...rcanal?.contextInfo }
          }, { quoted: m })
          continue
        } catch {}
      }

      await conn.sendMessage(m.chat, {
        text: leyenda,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }
  } catch (e) {
    console.error('Error en igsearch:', e)
    return conn.sendMessage(m.chat, {
      text: typeof e === 'string'
        ? e
        : `[❗] Error al buscar reels.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['igsearch <búsqueda>', 'igs <búsqueda>']
handler.tags = ['downloader']
handler.command = ['igsearch', 'igs', 'igbuscar']
handler.group = true

export default handler
