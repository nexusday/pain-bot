let handler = async (m, { conn, usedPrefix }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '《✧》Este comando solo funciona en grupos.'
      }, { quoted: m })
    }
    
    if (!m.quoted) {
      return conn.sendMessage(m.chat, {
        text: `《✧》Debes responder a un mensaje que contenga imagen y texto.\n\n*Uso:* Responde a un mensaje con ${usedPrefix}savep`
      }, { quoted: m })
    }
    
    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || q.mediaType || ''
    
    if (!/image|video/.test(mime)) {
      return conn.sendMessage(m.chat, {
        text: '《✧》El mensaje debe contener una imagen o video.'
      }, { quoted: m })
    }
    
    if (!global.db.data.publicaciones) global.db.data.publicaciones = {}
    if (!global.db.data.publicaciones[m.chat]) global.db.data.publicaciones[m.chat] = {
      enabled: false,
      image: '',
      text: '',
      imageType: '',
      interval: 600000,
      savedBy: '',
      savedAt: '',
      activatedBy: '',
      activatedAt: '',
      timeSetBy: '',
      timeSetAt: ''
    }
    
    if (global.db.data.publicaciones[m.chat]) {
      if (!global.db.data.publicaciones[m.chat].imageType) global.db.data.publicaciones[m.chat].imageType = ''
      if (!global.db.data.publicaciones[m.chat].savedBy) global.db.data.publicaciones[m.chat].savedBy = ''
      if (!global.db.data.publicaciones[m.chat].savedAt) global.db.data.publicaciones[m.chat].savedAt = ''
      if (!global.db.data.publicaciones[m.chat].activatedBy) global.db.data.publicaciones[m.chat].activatedBy = ''
      if (!global.db.data.publicaciones[m.chat].activatedAt) global.db.data.publicaciones[m.chat].activatedAt = ''
      if (!global.db.data.publicaciones[m.chat].timeSetBy) global.db.data.publicaciones[m.chat].timeSetBy = ''
      if (!global.db.data.publicaciones[m.chat].timeSetAt) global.db.data.publicaciones[m.chat].timeSetAt = ''
      if (!global.db.data.publicaciones[m.chat].interval) global.db.data.publicaciones[m.chat].interval = 600000
    }
    
    let imageBuffer
    let imageType = 'image'
    
    if (/image/.test(mime)) {
      imageBuffer = await q.download()
      imageType = 'image'
    } else if (/video/.test(mime)) {
      imageBuffer = await q.download()
      imageType = 'video'
    }
    
    const text = q.caption || q.text || ''
    
    global.db.data.publicaciones[m.chat].image = imageBuffer.toString('base64')
    global.db.data.publicaciones[m.chat].text = text
    global.db.data.publicaciones[m.chat].imageType = imageType
    global.db.data.publicaciones[m.chat].savedBy = m.sender
    global.db.data.publicaciones[m.chat].savedAt = new Date().toISOString()
    
    await global.db.write()
    
    let txt = `╭─「 *PUBLICACIÓN GUARDADA* 」─╮\n`
    txt += `│\n`
    txt += `╰➺ *Tipo:* ${imageType === 'image' ? 'Imagen' : 'Video'}\n`
    txt += `╰➺ *Texto:* ${text.length > 50 ? text.substring(0, 50) + '...' : text || 'Sin texto'}\n`
    txt += `╰➺ *Usuario:* @${m.sender.split('@')[0]}\n`
    txt += `│\n`
    txt += `╰➺ *Para activar:* ${usedPrefix}publicg on\n`
    txt += `╰➺ *Para desactivar:* ${usedPrefix}publicg off\n`
    txt += `\n> PAIN COMMUNITY`
    
    await conn.sendMessage(m.chat, {
      text: txt,
      contextInfo: {
        mentionedJid: [m.sender]
      }
    }, { quoted: m })
    
  } catch (e) {
    console.error('Error en savep:', e)
    return conn.sendMessage(m.chat, {
      text: '《✧》Ocurrió un error al guardar la publicación.'
    }, { quoted: m })
  }
}

handler.command = ['savep', 'savepublicacion']
handler.group = true
handler.admin = true

export default handler
