/**
* Sistema de bienvenidas y despedidas
*/

import { shouldSkipByModoSub } from '../plugins/modo-sub.js'

export async function manejarBienvenidaDespedida(conn, update) {
    let { id, participants, action } = update

    if (!id) return
    id = conn.decodeJid(id)
    if (id === 'status@broadcast') return

    // Solo el bot elegido con .modosub responde bienvenidas/despedidas en el grupo
    if (id.endsWith('@g.us') && shouldSkipByModoSub(conn, id)) return

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

        const metadatosGrupo = await conn.groupMetadata(id).catch(_ => null)
        if (!metadatosGrupo) {
            return
        }

        for (const participante of participants) {
            let idParticipante = conn.decodeJid(participante)

            if (typeof idParticipante === 'object') {
                idParticipante = idParticipante.id || idParticipante.jid || participante.toString()
            }

            try {
                if (action === 'add') {
                    await enviarMensajeBienvenida(conn, id, idParticipante, metadatosGrupo)
                } else if (action === 'remove') {
                    await enviarMensajeDespedida(conn, id, idParticipante, metadatosGrupo)
                }
            } catch (error) {

            }

            await new Promise(resolve => setTimeout(resolve, 1000))
        }

    } catch (error) {

    }
}

async function enviarMensajeBienvenida(conn, groupId, participantId, groupMetadata) {
    try {
        let usuario = await conn.getName(participantId) || 'Usuario'
        const grupo = await conn.getName(groupId) || 'Grupo'
        const cantidadMiembros = groupMetadata.participants.length

        const ahora = new Date()
        const fecha = ahora.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
        const hora = ahora.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        })

        let mensajeBienvenida = global.db.data.bienvenidas[groupId].welcomeMsg || obtenerMensajeBienvenidaPorDefecto()
        mensajeBienvenida = reemplazarMarcadores(mensajeBienvenida, { user: usuario, group: grupo, memberCount: cantidadMiembros, date: fecha, time: hora, participant: participantId })

        const imgBienvenida = global.db.data.bienvenidas[groupId].welcomeImg

        if (imgBienvenida && imgBienvenida.trim() !== '') {
            await conn.sendMessage(groupId, {
                image: { url: imgBienvenida },
                caption: mensajeBienvenida,
                contextInfo: {
                    mentionedJid: [participantId]
                }
            })
        } else {
            const pp = await conn.profilePictureUrl(groupId, 'image').catch(_ => null)
            if (pp) {
                await conn.sendMessage(groupId, {
                    image: { url: pp },
                    caption: mensajeBienvenida,
                    contextInfo: {
                        mentionedJid: [participantId]
                    }
                })
            } else {
                await conn.sendMessage(groupId, {
                    text: mensajeBienvenida,
                    contextInfo: {
                        mentionedJid: [participantId]
                    }
                })
            }
        }

    } catch (error) {

    }
}

async function enviarMensajeDespedida(conn, groupId, participantId, groupMetadata) {
    try {
        let usuario = await conn.getName(participantId) || 'Usuario'
        const grupo = await conn.getName(groupId) || 'Grupo'
        const cantidadMiembros = groupMetadata.participants.length

        const ahora = new Date()
        const fecha = ahora.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
        const hora = ahora.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        })

        let mensajeDespedida = global.db.data.bienvenidas[groupId].goodbyeMsg || obtenerMensajeDespedidaPorDefecto()
        mensajeDespedida = reemplazarMarcadores(mensajeDespedida, { user: usuario, group: grupo, memberCount: cantidadMiembros, date: fecha, time: hora, participant: participantId })

        const imgDespedida = global.db.data.bienvenidas[groupId].goodbyeImg

        if (imgDespedida && imgDespedida.trim() !== '') {
            await conn.sendMessage(groupId, {
                image: { url: imgDespedida },
                caption: mensajeDespedida,
                contextInfo: {
                    mentionedJid: [participantId]
                }
            })
        } else {
            const pp = await conn.profilePictureUrl(groupId, 'image').catch(_ => null)
            if (pp) {
                await conn.sendMessage(groupId, {
                    image: { url: pp },
                    caption: mensajeDespedida,
                    contextInfo: {
                        mentionedJid: [participantId]
                    }
                })
            } else {
                await conn.sendMessage(groupId, {
                    text: mensajeDespedida,
                    contextInfo: {
                        mentionedJid: [participantId]
                    }
                })
            }
        }

    } catch (error) {

    }
}

function reemplazarMarcadores(message, data) {
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

function obtenerMensajeBienvenidaPorDefecto() {
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

function obtenerMensajeDespedidaPorDefecto() {
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

export {
  manejarBienvenidaDespedida as handleWelcomeGoodbye
}
