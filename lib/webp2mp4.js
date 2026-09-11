import fetch from 'node-fetch'
import { FormData, Blob } from 'formdata-node'
import { JSDOM } from 'jsdom'

async function webpAMp4(fuente) {
    let formulario = new FormData()
    let esUrl = typeof fuente === 'string' && /https?:\/\//.test(fuente)
    
    let blob
    if (!esUrl) {
       
        if (Buffer.isBuffer(fuente)) {
            blob = new Blob([fuente], { type: 'image/webp' })
        } else if (fuente && typeof fuente.arrayBuffer === 'function') {
           
            const arrayBuffer = await fuente.arrayBuffer()
            blob = new Blob([arrayBuffer], { type: 'image/webp' })
        } else {
            throw new Error('Formato de fuente no soportado')
        }
    }
    
    formulario.append('new-image-url', esUrl ? '' : '')
    formulario.append('new-image', esUrl ? '' : blob, 'image.webp')
    let res = await fetch('https://ezgif.com/webp-to-mp4', {
        method: 'POST',
        body: formulario
    })
    let html = await res.text()
    let {
        document
    } = new JSDOM(html).window
    let formulario2 = new FormData()
    let obj = {}
    for (let input of document.querySelectorAll('form input[name]')) {
        obj[input.name] = input.value
        formulario2.append(input.name, input.value)
    }
    let res2 = await fetch('https://ezgif.com/webp-to-mp4/' + obj.file, {
        method: 'POST',
        body: formulario2
    })
    let html2 = await res2.text()
    let {
        document: document2
    } = new JSDOM(html2).window
    return new URL(document2.querySelector('div#output > p.outfile > video > source').src, res2.url).toString()
}

async function webpAPng(fuente) {
    let formulario = new FormData()
    let esUrl = typeof fuente === 'string' && /https?:\/\//.test(fuente)
    
    let blob
    if (!esUrl) {
      
        if (Buffer.isBuffer(fuente)) {
            blob = new Blob([fuente], { type: 'image/webp' })
        } else if (fuente && typeof fuente.arrayBuffer === 'function') {
        
            const arrayBuffer = await fuente.arrayBuffer()
            blob = new Blob([arrayBuffer], { type: 'image/webp' })
        } else {
            throw new Error('Formato de fuente no soportado')
        }
    }
    
    formulario.append('new-image-url', esUrl ? '' : '')
    formulario.append('new-image', esUrl ? '' : blob, 'image.webp')
    let res = await fetch('https://ezgif.com/webp-to-png', {
        method: 'POST',
        body: formulario
    })
    let html = await res.text()
    let {
        document
    } = new JSDOM(html).window
    let formulario2 = new FormData()
    let obj = {}
    for (let input of document.querySelectorAll('form input[name]')) {
        obj[input.name] = input.value
        formulario2.append(input.name, input.value)
    }
    let res2 = await fetch('https://ezgif.com/webp-to-png/' + obj.file, {
        method: 'POST',
        body: formulario2
    })
    let html2 = await res2.text()
    let {
        document: document2
    } = new JSDOM(html2).window
    return new URL(document2.querySelector('div#output > p.outfile > img').src, res2.url).toString()
}

export {
  webpAMp4 as webp2mp4,
  webpAPng as webp2png,
  webpAMp4,
  webpAPng
}
