/**
* Sistema de bienvenidas y despedidas
*/

export async function handleWelcomeGoodbye(conn, update) {
    let { id, participants, action } = update

    if (!id) return
    id = conn.decodeJid(id)
    if (id === 'status@broadcast') return

    
    if (!global.db || !global.db.data) {
        return
    }

    
    if (!global.db.data.bienvenidas) {
        global.db.data.bienvenidas = {}
    }

    try {
        

        const config = global.db.data.bienvenidas[id]
        if (config === true) {
            global.db.data.bienvenidas[id] = {
                enabled: true,
                welcomeMsg: '',
                goodbyeMsg: '',
                welcomeImg: '',
                goodbyeImg: ''
            }
        } else if (config === false) {
            global.db.data.bienvenidas[id] = {
                enabled: false,
                welcomeMsg: '',
                goodbyeMsg: '',
                welcomeImg: '',
                goodbyeImg: ''
            }
        } else if (!config || typeof config !== 'object') {
            global.db.data.bienvenidas[id] = {
                enabled: false,
                welcomeMsg: '',
                goodbyeMsg: '',
                welcomeImg: '',
                goodbyeImg: ''
            }
        }

        
        if (!global.db.data.bienvenidas[id] || !global.db.data.bienvenidas[id].enabled) {
            return
        }

        
        const groupMetadata = await conn.groupMetadata(id).catch(_ => null)
        if (!groupMetadata) {
            return
        }

        

        for (const participant of participants) {
            let participantId = conn.decodeJid(participant)
            
            
            if (typeof participantId === 'object') {
                participantId = participantId.id || participantId.jid || participant.toString()
            }
            

            try {
                if (action === 'add') {
                    await sendWelcomeMessage(conn, id, participantId, groupMetadata)
                } else if (action === 'remove') {
                    await sendGoodbyeMessage(conn, id, participantId, groupMetadata)
                }
            } catch (error) {
                
            }

            
            await new Promise(resolve => setTimeout(resolve, 1000))
        }

    } catch (error) {
        
    }
}

async function sendWelcomeMessage(conn, groupId, participantId, groupMetadata) {
    try {
        

        let user = await conn.getName(participantId) || 'Usuario'
        const group = await conn.getName(groupId) || 'Grupo'
        const memberCount = groupMetadata.participants.length

        const now = new Date()
        const date = now.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
        const time = now.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        })

        let welcomeMsg = global.db.data.bienvenidas[groupId].welcomeMsg || getDefaultWelcomeMessage()
        welcomeMsg = replacePlaceholders(welcomeMsg, { user, group, memberCount, date, time, participant: participantId })

        const welcomeImg = global.db.data.bienvenidas[groupId].welcomeImg

        if (welcomeImg && welcomeImg.trim() !== '') {
            
            await conn.sendMessage(groupId, {
                image: { url: welcomeImg },
                caption: welcomeMsg,
                contextInfo: {
                    mentionedJid: [participantId]
                }
            })
        } else {
            
            const pp = await conn.profilePictureUrl(groupId, 'image').catch(_ => null)
            if (pp) {
                await conn.sendMessage(groupId, {
                    image: { url: pp },
                    caption: welcomeMsg,
                    contextInfo: {
                        mentionedJid: [participantId]
                    }
                })
            } else {
                await conn.sendMessage(groupId, {
                    text: welcomeMsg,
                    contextInfo: {
                        mentionedJid: [participantId]
                    }
                })
            }
        }

        

    } catch (error) {
        
    }
}

async function sendGoodbyeMessage(conn, groupId, participantId, groupMetadata) {
    try {
        

        let user = await conn.getName(participantId) || 'Usuario'
        const group = await conn.getName(groupId) || 'Grupo'
        const memberCount = groupMetadata.participants.length

        const now = new Date()
        const date = now.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
        const time = now.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        })

        let goodbyeMsg = global.db.data.bienvenidas[groupId].goodbyeMsg || getDefaultGoodbyeMessage()
        goodbyeMsg = replacePlaceholders(goodbyeMsg, { user, group, memberCount, date, time, participant: participantId })

        const goodbyeImg = global.db.data.bienvenidas[groupId].goodbyeImg

        if (goodbyeImg && goodbyeImg.trim() !== '') {
            
            await conn.sendMessage(groupId, {
                image: { url: goodbyeImg },
                caption: goodbyeMsg,
                contextInfo: {
                    mentionedJid: [participantId]
                }
            })
        } else {
            
            const pp = await conn.profilePictureUrl(groupId, 'image').catch(_ => null)
            if (pp) {
                await conn.sendMessage(groupId, {
                    image: { url: pp },
                    caption: goodbyeMsg,
                    contextInfo: {
                        mentionedJid: [participantId]
                    }
                })
            } else {
                await conn.sendMessage(groupId, {
                    text: goodbyeMsg,
                    contextInfo: {
                        mentionedJid: [participantId]
                    }
                })
            }
        }

        

    } catch (error) {
        
    }
}

function replacePlaceholders(message, data) {
    let participant = data.participant
    if (typeof participant !== 'string') {
        participant = participant.toString()
    }
    
    return message
        .replace(/\${user}/g, data.user)
        .replace(/\${participant}/g, `@${participant.split('@')[0]}`)
        .replace(/\${group}/g, data.group)
        .replace(/\${memberCount}/g, data.memberCount)
        .replace(/\${date}/g, data.date)
        .replace(/\${time}/g, data.time)
}

function getDefaultWelcomeMessage() {
    return `╭─「 *BIENVENIDO* 」─╮
│
╰➺ *Usuario:* \${participant}
╰➺ *Grupo:* \${group}
╰➺ *Miembros:* \${memberCount}
│
╰➺ *Fecha:* \${date}
╰➺ *Hora:* \${time}
│
╰➺ *Bienvenido al grupo!*`
}

function getDefaultGoodbyeMessage() {
    return `╭─「 *ADIOS* 」─╮
│
╰➺ *Usuario:* \${participant}
╰➺ *Grupo:* \${group}
╰➺ *Miembros:* \${memberCount}
│
╰➺ *Fecha:* \${date}
╰➺ *Hora:* \${time}
│
╰➺ *¡Que tengas un buen día!*`
}
