/**
 * Sistema de Sugerencias de Comandos
 * Sugiere comandos similares cuando no se encuentra uno
 */

export async function handleCommandSuggestions(m, conn, commandExecuted) {
  if (m.text && !commandExecuted && !m.commandExecuted) {
    if (!m.isGroup) return

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

    const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
    let _prefix = conn.prefix ? conn.prefix : global.prefix
    let match = (_prefix instanceof RegExp ?
      [[_prefix.exec(m.text), _prefix]] :
      Array.isArray(_prefix) ?
        _prefix.map(p => {
          let re = p instanceof RegExp ? p : new RegExp(str2Regex(p))
          return [re.exec(m.text), re]
        }) :
        typeof _prefix === 'string' ?
          [[new RegExp(str2Regex(_prefix)).exec(m.text), new RegExp(str2Regex(_prefix))]] :
          [[[], new RegExp]]
    ).find(p => p[1] && p[0])

    if (match) {
      const prefixMatch = match[0]
      const noPrefix = m.text.slice(prefixMatch[0].length).trim()
      const [commandText, ...args] = noPrefix.split(/\s+/)
      const command = commandText?.toLowerCase()

      if (command) {
        const fullCommand = prefixMatch[0] + commandText
        const menuCommand = prefixMatch[0] + 'menu'

        let bestSuggestion = null
        let bestScore = 0
        const allCommands = []

       
        if (global.plugins) {
          Object.values(global.plugins).forEach(plugin => {
            if (plugin.command && Array.isArray(plugin.command)) {
              plugin.command.forEach(cmd => {
                if (typeof cmd === 'string') {
                  allCommands.push(cmd)
                }
              })
            }
          })
        }

       
        allCommands.forEach(cmd => {
          if (cmd.toLowerCase() !== command) {
            let score = 0
            const cmdLower = cmd.toLowerCase()

            if (command.length === 1) {
              if (cmdLower.startsWith(command)) score += 50
              if (cmdLower.includes(command)) score += 30
            }

            if (command.length <= 3) {
              if (cmdLower.startsWith(command)) score += 40
              if (cmdLower.includes(command)) score += 25
            }

            if (command.length === cmdLower.length) {
              let charMatches = 0
              for (let i = 0; i < command.length; i++) {
                if (command[i] === cmdLower[i]) charMatches++
              }

              if (charMatches / command.length >= 0.7) score += 35
            }

            if (cmdLower.includes(command)) score += 20

            if (command.includes(cmdLower)) score += 15

            if (cmdLower.startsWith(command) || command.startsWith(cmdLower)) score += 10

            if (cmdLower.endsWith(command) || command.endsWith(cmdLower)) score += 8

            for (let i = 0; i < Math.min(command.length, cmdLower.length); i++) {
              if (command[i] === cmdLower[i]) score += 3
            }

            if (command.length === cmdLower.length) score += 5

            if (score > bestScore) {
              bestScore = score
              bestSuggestion = cmd
            }
          }
        })

        let message = `🌴 El comando *${fullCommand}* no existe\n`

        if (bestSuggestion && bestScore >= 10) {
          const cmdLower = bestSuggestion.toLowerCase()
          let similarityScore = 0

          let charMatches = 0
          for (let i = 0; i < Math.min(command.length, cmdLower.length); i++) {
            if (command[i] === cmdLower[i]) charMatches++
          }

          const charSimilarity = charMatches / Math.max(command.length, cmdLower.length)

          let contentSimilarity = 0
          if (cmdLower.includes(command)) contentSimilarity = command.length / cmdLower.length
          else if (command.includes(cmdLower)) contentSimilarity = cmdLower.length / command.length

          let startSimilarity = 0
          const minLength = Math.min(command.length, cmdLower.length)
          for (let i = 0; i < minLength; i++) {
            if (command[i] === cmdLower[i]) startSimilarity += 1
          }
          startSimilarity = startSimilarity / minLength

          const finalSimilarity = (charSimilarity * 0.4 + contentSimilarity * 0.4 + startSimilarity * 0.2)
          const percentage = Math.min(100, Math.round(finalSimilarity * 100))

          message += `*Posibilidad de que sea:*\n`
          message += `*${prefixMatch[0]}${bestSuggestion}* (${percentage}%)\n\n`
        }

        message += `> Por favor usa *${menuCommand}* para ver la lista de comandos disponibles.`

        return conn.sendMessage(m.chat, {
          text: message,
          contextInfo: {
            ...rcanal.contextInfo
          }
        }, { quoted: m })
      }
    }
  }

  return false
}
