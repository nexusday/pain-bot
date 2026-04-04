// Sistema de publicaciones automáticas deshabilitado por petición del usuario.
// Se deja un handler mínimo que informa que la funcionalidad fue removida
let handler = async (m, { conn }) => {
  return conn.sendMessage(m.chat, { text: 'El sistema de publicaciones automáticas fue deshabilitado y sus comandos han sido removidos.' }, { quoted: m })
}

// No registrar los comandos originales para evitar su uso
handler.command = []
handler.group = true
handler.admin = true

export default handler
