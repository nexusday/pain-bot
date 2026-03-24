let handler = async (m, { conn, usedPrefix, isOwner }) => {
  let vcard1 = `BEGIN:VCARD\nVERSION:3.0\nN:;Sunkovv </>;;\nFN:Sunkovv </>\nORG:\nTITLE:\nitem1.TEL;waid=51901437507:5901437507\nitem1.X-ABLabel:\nX-WA-BIZ-DESCRIPTION:\nX-WA-BIZ-NAME:\nEND:VCARD`
  let vcard2 = `BEGIN:VCARD\nVERSION:3.0\nN:;Fernando;;\nFN:Fernando\nORG:\nTITLE:\nitem1.TEL;waid=5218448582376:5218448582376\nitem1.X-ABLabel:\nX-WA-BIZ-DESCRIPTION:\nX-WA-BIZ-NAME:\nEND:VCARD`
  let vcard3 = `BEGIN:VCARD\nVERSION:3.0\nN:;Kevin;;\nFN:Kevin\nORG:\nTITLE:\nitem1.TEL;waid=5219881032907:5219881032907\nitem1.X-ABLabel:\nX-WA-BIZ-DESCRIPTION:\nX-WA-BIZ-NAME:\nEND:VCARD`
  await conn.sendMessage(m.chat, {
    contacts: {
      displayName: 'Contactos',
      contacts: [{ vcard: vcard1 }, { vcard: vcard2 }, {vcard: vcard3 }]
    }
  }, { quoted: m })
}
handler.command = ['owner', 'creator', 'creador', 'dueño']
export default handler