/**
 * Sistema de Sugerencias de Comandos
 * Sugiere comandos similares cuando no se encuentra uno
 */

export async function manejarSugerenciasComando(m, conn, comandoEjecutado, esAdmin = false, esOwner = false) {
  if (m.text && !comandoEjecutado && !m.commandExecuted) {
    if (!m.isGroup) return

    if (global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
      if (!esAdmin && !esOwner) return false
    }

    if (global.db.data.botGroups && global.db.data.botGroups[m.chat] === false) {
      return false
    }

    const rcanal = global.rcanal || {
      contextInfo: {
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '',
          serverMessageId: 100,
          newsletterName: ''
        }
      }
    }

    const escaparRegex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
    let prefijo = conn.prefix ? conn.prefix : global.prefix
    let coincidencia = (prefijo instanceof RegExp ?
      [[prefijo.exec(m.text), prefijo]] :
      Array.isArray(prefijo) ?
        prefijo.map(p => {
          let re = p instanceof RegExp ? p : new RegExp(escaparRegex(p))
          return [re.exec(m.text), re]
        }) :
        typeof prefijo === 'string' ?
          [[new RegExp(escaparRegex(prefijo)).exec(m.text), new RegExp(escaparRegex(prefijo))]] :
          [[[], new RegExp]]
    ).find(p => p[1] && p[0])

    if (coincidencia) {
      const prefijoMatch = coincidencia[0]
      const sinPrefijo = m.text.slice(prefijoMatch[0].length).trim()
      const [textoComando, ...args] = sinPrefijo.split(/\s+/)
      const comando = textoComando?.toLowerCase()

      if (comando) {
        const comandoCompleto = prefijoMatch[0] + textoComando
        const comandoMenu = prefijoMatch[0] + 'menu'

        let mejorSugerencia = null
        let mejorPuntuacion = 0
        const todosComandos = []

        if (global.plugins) {
          Object.values(global.plugins).forEach(plugin => {
            if (plugin.command && Array.isArray(plugin.command)) {
              plugin.command.forEach(cmd => {
                if (typeof cmd === 'string') {
                  todosComandos.push(cmd)
                }
              })
            }
          })
        }

        todosComandos.forEach(cmd => {
          if (cmd.toLowerCase() !== comando) {
            let puntuacion = 0
            const cmdLower = cmd.toLowerCase()

            if (comando.length === 1) {
              if (cmdLower.startsWith(comando)) puntuacion += 50
              if (cmdLower.includes(comando)) puntuacion += 30
            }

            if (comando.length <= 3) {
              if (cmdLower.startsWith(comando)) puntuacion += 40
              if (cmdLower.includes(comando)) puntuacion += 25
            }

            if (comando.length === cmdLower.length) {
              let coincidenciasChar = 0
              for (let i = 0; i < comando.length; i++) {
                if (comando[i] === cmdLower[i]) coincidenciasChar++
              }

              if (coincidenciasChar / comando.length >= 0.7) puntuacion += 35
            }

            if (cmdLower.includes(comando)) puntuacion += 20

            if (comando.includes(cmdLower)) puntuacion += 15

            if (cmdLower.startsWith(comando) || comando.startsWith(cmdLower)) puntuacion += 10

            if (cmdLower.endsWith(comando) || comando.endsWith(cmdLower)) puntuacion += 8

            for (let i = 0; i < Math.min(comando.length, cmdLower.length); i++) {
              if (comando[i] === cmdLower[i]) puntuacion += 3
            }

            if (comando.length === cmdLower.length) puntuacion += 5

            if (puntuacion > mejorPuntuacion) {
              mejorPuntuacion = puntuacion
              mejorSugerencia = cmd
            }
          }
        })

        let mensaje = `🌴 El comando *${comandoCompleto}* no existe\n`

        if (mejorSugerencia && mejorPuntuacion >= 10) {
          const cmdLower = mejorSugerencia.toLowerCase()
          let puntuacionSimilitud = 0

          let coincidenciasChar = 0
          for (let i = 0; i < Math.min(comando.length, cmdLower.length); i++) {
            if (comando[i] === cmdLower[i]) coincidenciasChar++
          }

          const similitudChar = coincidenciasChar / Math.max(comando.length, cmdLower.length)

          let similitudContenido = 0
          if (cmdLower.includes(comando)) similitudContenido = comando.length / cmdLower.length
          else if (comando.includes(cmdLower)) similitudContenido = cmdLower.length / comando.length

          let similitudInicio = 0
          const longitudMin = Math.min(comando.length, cmdLower.length)
          for (let i = 0; i < longitudMin; i++) {
            if (comando[i] === cmdLower[i]) similitudInicio += 1
          }
          similitudInicio = similitudInicio / longitudMin

          const similitudFinal = (similitudChar * 0.4 + similitudContenido * 0.4 + similitudInicio * 0.2)
          const porcentaje = Math.min(100, Math.round(similitudFinal * 100))

          mensaje += `*Posibilidad de que sea:*\n`
          mensaje += `*${prefijoMatch[0]}${mejorSugerencia}* (${porcentaje}%)\n\n`
        }

        mensaje += `> Por favor usa *${comandoMenu}* para ver la lista de comandos disponibles.`

        return conn.sendMessage(m.chat, {
          text: mensaje,
          contextInfo: {
            ...rcanal.contextInfo
          }
        }, { quoted: m })
      }
    }
  }

  return false
}

export {
  manejarSugerenciasComando as handleCommandSuggestions
}
