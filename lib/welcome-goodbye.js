/**
* Sistema de bienvenidas y despedidas
*/

import fs from 'fs'
import { shouldSkipByModoSub } from '../plugins/modo-sub.js'

function payloadImagenBienvenida(rutaOUrl) {
    if (!rutaOUrl || !String(rutaOUrl).trim()) return null
    const v = String(rutaOUrl).trim()
    if (/^https?:\/\//i.test(v)) return { url: v }
    try {
        if (fs.existsSync(v)) return fs.readFileSync(v)
    } catch {}
    return null
}

async function enviarConImagenOTexto(conn, groupId, caption, rutaOUrl, mentionedJid) {
    const image = payloadImagenBienvenida(rutaOUrl)
    if (image) {
        await conn.sendMessage(groupId, {
            image,
            caption,
            contextInfo: { mentionedJid }
        })
        return
    }
    const pp = await conn.profilePictureUrl(groupId, 'image').catch(_ => null)
    if (pp) {
        await conn.sendMessage(groupId, {
            image: { url: pp },
            caption,
            contextInfo: { mentionedJid }
        })
        return
    }
    await conn.sendMessage(groupId, {
        text: caption,
        contextInfo: { mentionedJid }
    })
}

export async function manejarBienvenidaDespedida(conn, update) {
    let { id, participants, action } = update

    if (!id) return
    id = conn.decodeJid(id)
    if (id === 'status@broadcast') return

   
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
        await enviarConImagenOTexto(conn, groupId, mensajeBienvenida, imgBienvenida, [participantId])

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
        await enviarConImagenOTexto(conn, groupId, mensajeDespedida, imgDespedida, [participantId])

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
    return `ㅤ
𓂃 ࣪ ִֶָ☾.  *bienvenida*
_\${group}_

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
*hola*
\${participant}

miembros  ·  \`\${memberCount}\`
fecha  ·  \`\${date}\`
hora  ·  \`\${time}\`

pase y siéntete en casa
ㅤ`.trim()
}

function obtenerMensajeDespedidaPorDefecto() {
    return `ㅤ
𓂃 ࣪ ִֶָ☾.  *despedida*
_\${group}_

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
*adiós*
\${participant}

miembros  ·  \`\${memberCount}\`
fecha  ·  \`\${date}\`
hora  ·  \`\${time}\`

que te vaya bien
ㅤ`.trim()
}

export {
  manejarBienvenidaDespedida as handleWelcomeGoodbye
}
