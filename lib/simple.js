import path from "path";
import { toAudio } from "./converter.js";
import chalk from "chalk";
import fetch from "node-fetch";
import PhoneNumber from "awesome-phonenumber";
import fs from "fs";
import util from "util";
import { fileTypeFromBuffer } from "file-type";
import { format } from "util";
import { fileURLToPath } from "url";
import store from "./store.js";
import { markViewOnceMessage, cacheViewOnceRaw } from "./viewOnce.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @type {import("baileys")}
 */
const {
  makeWASocket: crearSocketWAOriginal,
  downloadContentFromMessage,
  jidDecode,
  areJidsSameUser,
  generateWAMessage,
  generateForwardMessageContent,
  generateWAMessageFromContent,
  WAMessageStubType,
  extractMessageContent,
  makeInMemoryStore,
  getAggregateVotesInPollMessage,
  prepareWAMessageMedia,
  WA_DEFAULT_EPHEMERAL,
  PHONENUMBER_MCC,
} = await import("@whiskeysockets/baileys");

const { proto } = await import("@whiskeysockets/baileys");

export function makeWASocket(opcionesConexion, opciones = {}) {
  /**
   * @type {import("baileys").WASocket | import("baileys").WALegacySocket}
   */
  const conn = crearSocketWAOriginal(opcionesConexion);

  const sock = Object.defineProperties(conn, {
    chats: {
      value: { ...(opciones.chats || {}) },
      writable: true,
    },
    decodeJid: {
      value(jid) {
        if (!jid || typeof jid !== "string")
          return (!esNulo(jid) && jid) || null;
        return jid.decodeJid();
      },
    },
    logger: {
      get() {
        return {
          info(...args) {
            console.log(
              chalk.bold.bgRgb(51, 204, 51)("INFO "),
              `[${chalk.rgb(255, 255, 255)(new Date().toUTCString())}]:`,
              chalk.cyan(format(...args)),
            );
          },
          error(...args) {
            console.log(
              chalk.bold.bgRgb(247, 38, 33)("ERROR "),
              `[${chalk.rgb(255, 255, 255)(new Date().toUTCString())}]:`,
              chalk.rgb(255, 38, 0)(format(...args)),
            );
          },
          warn(...args) {
            console.log(
              chalk.bold.bgRgb(255, 153, 0)("WARNING "),
              `[${chalk.rgb(255, 255, 255)(new Date().toUTCString())}]:`,
              chalk.redBright(format(...args)),
            );
          },
          trace(...args) {
            console.log(
              chalk.grey("TRACE "),
              `[${chalk.rgb(255, 255, 255)(new Date().toUTCString())}]:`,
              chalk.white(format(...args)),
            );
          },
          debug(...args) {
            console.log(
              chalk.bold.bgRgb(66, 167, 245)("DEBUG "),
              `[${chalk.rgb(255, 255, 255)(new Date().toUTCString())}]:`,
              chalk.white(format(...args)),
            );
          },
        };
      },
      enumerable: true,
    },
    sendNyanCat: {
      async value(jid, text = "", buffer, title, body, url, quoted, options) {
        if (buffer) {
          try {
            let tipoArchivo;
            ((tipoArchivo = await conn.getFile(buffer)), (buffer = tipoArchivo.data));
          } catch {
            buffer = buffer;
          }
        }
        const preparado = generateWAMessageFromContent(
          jid,
          {
            extendedTextMessage: {
              text: text,
              contextInfo: {
                externalAdReply: {
                  title: title,
                  body: body,
                  thumbnail: buffer,
                  sourceUrl: url,
                },
                mentionedJid: await conn.parseMention(text),
              },
            },
          },
          { quoted: quoted },
        );
        return conn.relayMessage(jid, preparado.message, { messageId: preparado.key.id });
      },
    },
    sendPayment: {
      async value(jid, amount, text, quoted, options) {
        conn.relayMessage(
          jid,
          {
            requestPaymentMessage: {
              currencyCodeIso4217: "PEN",
              amount1000: amount,
              requestFrom: null,
              noteMessage: {
                extendedTextMessage: {
                  text: text,
                  contextInfo: {
                    externalAdReply: {
                      showAdAttribution: true,
                    },
                    mentionedJid: conn.parseMention(text),
                  },
                },
              },
            },
          },
          {},
        );
      },
    },
    getFile: {
      /**
       * Obtiene un buffer desde ruta, URL o data-URI
       * @param {fs.PathLike} PATH
       * @param {Boolean} saveToFile
       */
      async value(PATH, guardarEnArchivo = false) {
        let respuesta;
        let nombreArchivo;
        let esTemporal = false;
        const datos = Buffer.isBuffer(PATH)
          ? PATH
          : PATH instanceof ArrayBuffer
            ? PATH.toBuffer()
            : /^data:.*?\/.*?;base64,/i.test(PATH)
              ? Buffer.from(PATH.split`,`[1], "base64")
              : /^https?:\/\//.test(PATH)
                ? await (respuesta = await fetch(PATH)).buffer()
                : fs.existsSync(PATH)
                  ? ((nombreArchivo = PATH), fs.readFileSync(PATH))
                  : typeof PATH === "string"
                    ? PATH
                    : Buffer.alloc(0);
        if (!Buffer.isBuffer(datos))
          throw new TypeError("Result is not a buffer");
        const tipo = (await fileTypeFromBuffer(datos)) || {
          mime: "application/octet-stream",
          ext: ".bin",
        };
        if (datos && guardarEnArchivo && !nombreArchivo) {
          const { PROJECT_TMP } = await import('./tmp-cleanup.js');
          nombreArchivo = path.join(PROJECT_TMP, `${Date.now()}.${tipo.ext.replace(/^\./, '')}`);
          await fs.promises.writeFile(nombreArchivo, datos);
          esTemporal = true;
        }
        return {
          res: respuesta,
          filename: nombreArchivo,
          isTemp: esTemporal,
          ...tipo,
          data: datos,
          deleteFile() {
            if (!esTemporal || !nombreArchivo) return Promise.resolve();
            return fs.promises.unlink(nombreArchivo).catch(() => {});
          },
        };
      },
      enumerable: true,
    },
    waitEvent: {
      /**
       * Espera un evento del socket
       * @param {String} eventName
       * @param {Boolean} is
       * @param {Number} maxTries
       */
      value(nombreEvento, esValido = () => true, maxIntentos = 25) {
        
        return new Promise((resolver, rechazar) => {
          let intentos = 0;
          const alEvento = (...args) => {
            if (++intentos > maxIntentos) rechazar("Max tries reached");
            else if (esValido()) {
              conn.ev.off(nombreEvento, alEvento);
              resolver(...args);
            }
          };
          conn.ev.on(nombreEvento, alEvento);
        });
      },
    },
    relayWAMessage: {
      async value(mensajeCompleto) {
        if (mensajeCompleto.message.audioMessage) {
          await conn.sendPresenceUpdate("recording", mensajeCompleto.key.remoteJid);
        } else {
          await conn.sendPresenceUpdate("composing", mensajeCompleto.key.remoteJid);
        }
        const resultadoEnvio = await conn.relayMessage(
          mensajeCompleto.key.remoteJid,
          mensajeCompleto.message,
          { messageId: mensajeCompleto.key.id },
        );
        conn.ev.emit("messages.upsert", {
          messages: [mensajeCompleto],
          type: "append",
        });
        return resultadoEnvio;
      },
    },
    sendFile: {
      /**
       * Envía media/archivo detectando el tipo automáticamente
       * @param {String} jid
       * @param {String|Buffer} path
       * @param {String} filename
       * @param {String} caption
       * @param {import("baileys").proto.WebMessageInfo} quoted
       * @param {Boolean} ptt
       * @param {Object} options
       */
      async value(
        jid,
        path,
        filename = "",
        caption = "",
        quoted,
        ptt = false,
        options = {},
      ) {
        const tipo = await conn.getFile(path, true);
        let { res, data: archivo, filename: rutaArchivo } = tipo;
        if ((res && res.status !== 200) || archivo.length <= 65536) {
          try {
            throw { json: JSON.parse(archivo.toString()) };
          } catch (e) {
            if (e.json) throw e.json;
          }
        }
        const opc = {};
        if (quoted) opc.quoted = quoted;
        if (!tipo) options.asDocument = true;
        let tipoMsg = "";
        let tipoMime = options.mimetype || tipo.mime;
        let convertido;
        if (
          /webp/.test(tipo.mime) ||
          (/image/.test(tipo.mime) && options.asSticker)
        )
          tipoMsg = "sticker";
        else if (
          /image/.test(tipo.mime) ||
          (/webp/.test(tipo.mime) && options.asImage)
        )
          tipoMsg = "image";
        else if (/video/.test(tipo.mime)) tipoMsg = "video";
        else if (/audio/.test(tipo.mime)) {
          ((convertido = await toAudio(archivo, tipo.ext)),
            (archivo = convertido.data),
            (rutaArchivo = convertido.filename),
            (tipoMsg = "audio"),
            (tipoMime = options.mimetype || "audio/mpeg; codecs=opus"));
        } else tipoMsg = "document";
        if (options.asDocument) tipoMsg = "document";

        delete options.asSticker;
        delete options.asLocation;
        delete options.asVideo;
        delete options.asDocument;
        delete options.asImage;

        const mensaje = {
          ...options,
          caption,
          ptt,
          [tipoMsg]: { url: rutaArchivo },
          mimetype: tipoMime,
          fileName: filename || rutaArchivo.split("/").pop(),
        };
        /**
         * @type {import("baileys").proto.WebMessageInfo}
         */
        let m;
        try {
          m = await conn.sendMessage(jid, mensaje, { ...opc, ...options });
        } catch (e) {
          console.error(e);
          m = null;
        } finally {
          if (!m)
            m = await conn.sendMessage(
              jid,
              { ...mensaje, [tipoMsg]: archivo },
              { ...opc, ...options },
            );
          archivo = null;
          await tipo.deleteFile?.().catch(() => {});
          await convertido?.delete?.().catch(() => {});
          return m;
        }
      },
      enumerable: true,
    },
    sendContact: {
      /**
       * Envía contacto(s)
       * @param {String} jid
       * @param {String[][]|String[]} data
       * @param {import("baileys").proto.WebMessageInfo} quoted
       * @param {Object} options
       */
      async value(jid, data, quoted, options) {
        if (!Array.isArray(data[0]) && typeof data[0] === "string")
          data = [data];
        const contactos = [];
        for (let [numero, nombre] of data) {
          numero = numero.replace(/[^0-9]/g, "");
          const jidNuevo = numero + "@s.whatsapp.net";
          const perfilNegocio =
            (await conn.getBusinessProfile(jidNuevo).catch((_) => null)) || {};
          const vcard = `
BEGIN:VCARD
VERSION:3.0
N:;${nombre.replace(/\n/g, "\\n")};;;
FN:${nombre.replace(/\n/g, "\\n")}
TEL;type=CELL;type=VOICE;waid=${numero}:${PhoneNumber("+" + numero).getNumber("international")}${
            perfilNegocio.description
              ? `
X-WA-BIZ-NAME:${(conn.chats[jidNuevo]?.vname || conn.getName(jidNuevo) || nombre).replace(/\n/, "\\n")}
X-WA-BIZ-DESCRIPTION:${perfilNegocio.description.replace(/\n/g, "\\n")}
`.trim()
              : ""
          }
END:VCARD
        `.trim();
          contactos.push({ vcard, displayName: nombre });
        }
        return await conn.sendMessage(
          jid,
          {
            ...options,
            contacts: {
              ...options,
              displayName:
                (contactos.length >= 2
                  ? `${contactos.length} kontak`
                  : contactos[0].displayName) || null,
              contacts: contactos,
            },
          },
          { quoted, ...options },
        );
      },
      enumerable: true,
    },
    reply: {
      /**
       * Responde a un mensaje
       * @param {String} jid
       * @param {String|Buffer} text
       * @param {import("baileys").proto.WebMessageInfo} quoted
       * @param {Object} options
       */
      value(jid, text = "", quoted, options) {
        return Buffer.isBuffer(text)
          ? conn.sendFile(jid, text, "file", "", quoted, false, options)
          : conn.sendMessage(jid, { ...options, text }, { quoted, ...options });
      },
    },



    sendButtonMessages: {
      async value(jid, messages, quoted, options) {
        messages.length > 1
          ? await conn.sendCarousel(jid, messages, quoted, options)
          : await conn.sendNCarousel(jid, ...messages[0], quoted, options);
      },
    },

    /**
     * Send nativeFlowMessage
     */

    sendNCarousel: {
      async value(
        jid,
        text = "",
        footer = "",
        buffer,
        buttons,
        copy,
        urls,
        list,
        quoted,
        options,
      ) {
        let imagen, video;
        if (buffer) {
          if (/^https?:\/\//i.test(buffer)) {
            try {
              const respuestaHttp = await fetch(buffer);
              const tipoContenido = respuestaHttp.headers.get("content-type");
              if (/^image\//i.test(tipoContenido)) {
                imagen = await prepareWAMessageMedia(
                  {
                    image: {
                      url: buffer,
                    },
                  },
                  {
                    upload: conn.waUploadToServer,
                    ...options,
                  },
                );
              } else if (/^video\//i.test(tipoContenido)) {
                video = await prepareWAMessageMedia(
                  {
                    video: {
                      url: buffer,
                    },
                  },
                  {
                    upload: conn.waUploadToServer,
                    ...options,
                  },
                );
              } else {
                console.error("Incompatible MIME type:", tipoContenido);
              }
            } catch (error) {
              console.error("Failed to get MIME type:", error);
            }
          } else {
            try {
              const type = await conn.getFile(buffer);
              if (/^image\//i.test(type.mime)) {
                imagen = await prepareWAMessageMedia(
                  {
                    image: /^https?:\/\//i.test(buffer)
                      ? {
                          url: buffer,
                        }
                      : type && type?.data,
                  },
                  {
                    upload: conn.waUploadToServer,
                    ...options,
                  },
                );
              } else if (/^video\//i.test(type.mime)) {
                video = await prepareWAMessageMedia(
                  {
                    video: /^https?:\/\//i.test(buffer)
                      ? {
                          url: buffer,
                        }
                      : type && type?.data,
                  },
                  {
                    upload: conn.waUploadToServer,
                    ...options,
                  },
                );
              }
            } catch (error) {
              console.error("Failed to get file type:", error);
            }
          }
        }
        const botonesDinamicos = buttons.map((btn) => ({
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: btn[0],
            id: btn[1],
          }),
        }));
        botonesDinamicos.push(
          copy && (typeof copy === "string" || typeof copy === "number")
            ? {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                  display_text: "Copy",
                  copy_code: copy,
                }),
              }
            : null,
        );
        urls?.forEach((url) => {
          botonesDinamicos.push({
            name: "cta_url",
            buttonParamsJson: JSON.stringify({
              display_text: url[0],
              url: url[1],
              merchant_url: url[1],
            }),
          });
        });
        list?.forEach((lister) => {
          botonesDinamicos.push({
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: lister[0],
              sections: lister[1],
            }),
          });
        });
        const interactiveMessage = {
          body: {
            text: text || "",
          },
          footer: {
            text: footer || wm,
          },
          header: {
            hasMediaAttachment:
              imagen?.imageMessage || video?.videoMessage ? true : false,
            imageMessage: imagen?.imageMessage || null,
            videoMessage: video?.videoMessage || null,
          },
          nativeFlowMessage: {
            buttons: botonesDinamicos.filter(Boolean),
            messageParamsJson: "",
          },
          ...Object.assign(
            {
              mentions:
                typeof text === "string" ? conn.parseMention(text || "@0") : [],
              contextInfo: {
                mentionedJid:
                  typeof text === "string"
                    ? conn.parseMention(text || "@0")
                    : [],
              },
            },
            {
              ...(options || {}),
              ...(conn.temareply?.contextInfo && {
                contextInfo: {
                  ...(options?.contextInfo || {}),
                  ...conn.temareply?.contextInfo,
                  externalAdReply: {
                    ...(options?.contextInfo?.externalAdReply || {}),
                    ...conn.temareply?.contextInfo?.externalAdReply,
                  },
                },
              }),
            },
          ),
        };
        const contenidoMensaje = proto.Message.create({
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2,
              },
              interactiveMessage,
            },
          },
        });
        const msgs = await generateWAMessageFromContent(jid, contenidoMensaje, {
          userJid: conn.user.jid,
          quoted: quoted,
          upload: conn.waUploadToServer,
          ephemeralExpiration: WA_DEFAULT_EPHEMERAL,
        });
        await conn.relayMessage(jid, msgs.message, {
          messageId: msgs.key.id,
        });
      },
    },
    /**
     * Send carouselMessage
     */
    sendCarousel: {
      async value(
        jid,
        text = "",
        footer = "",
        text2 = "",
        messages,
        quoted,
        options,
      ) {
        if (messages.length > 1) {
          const tarjetas = await Promise.all(
            messages.map(
              async ([
                text = "",
                footer = "",
                buffer,
                buttons,
                copy,
                urls,
                list,
              ]) => {
                let imagen, video;
                if (/^https?:\/\//i.test(buffer)) {
                  try {
                    const respuestaHttp = await fetch(buffer);
                    const tipoContenido = respuestaHttp.headers.get("content-type");
                    if (/^image\//i.test(tipoContenido)) {
                      imagen = await prepareWAMessageMedia(
                        {
                          image: {
                            url: buffer,
                          },
                        },
                        {
                          upload: conn.waUploadToServer,
                          ...options,
                        },
                      );
                    } else if (/^video\//i.test(tipoContenido)) {
                      video = await prepareWAMessageMedia(
                        {
                          video: {
                            url: buffer,
                          },
                        },
                        {
                          upload: conn.waUploadToServer,
                          ...options,
                        },
                      );
                    } else {
                      console.error("Incompatible MIME types:", tipoContenido);
                    }
                  } catch (error) {
                    console.error("Failed to get MIME type:", error);
                  }
                } else {
                  try {
                    const type = await conn.getFile(buffer);
                    if (/^image\//i.test(type.mime)) {
                      imagen = await prepareWAMessageMedia(
                        {
                          image: /^https?:\/\//i.test(buffer)
                            ? {
                                url: buffer,
                              }
                            : type && type?.data,
                        },
                        {
                          upload: conn.waUploadToServer,
                          ...options,
                        },
                      );
                    } else if (/^video\//i.test(type.mime)) {
                      video = await prepareWAMessageMedia(
                        {
                          video: /^https?:\/\//i.test(buffer)
                            ? {
                                url: buffer,
                              }
                            : type && type?.data,
                        },
                        {
                          upload: conn.waUploadToServer,
                          ...options,
                        },
                      );
                    }
                  } catch (error) {
                    console.error("Failed to get file type:", error);
                  }
                }
                const botonesDinamicos = buttons.map((btn) => ({
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({
                    display_text: btn[0],
                    id: btn[1],
                  }),
                }));
                /*dynamicButtons.push(
              (copy && (typeof copy === 'string' || typeof copy === 'number')) && {
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                  display_text: 'Copy',
                  copy_code: copy
                })
              });*/
                copy = Array.isArray(copy) ? copy : [copy];
                copy.map((copy) => {
                  botonesDinamicos.push({
                    name: "cta_copy",
                    buttonParamsJson: JSON.stringify({
                      display_text: "Copy",
                      copy_code: copy[0],
                    }),
                  });
                });
                urls?.forEach((url) => {
                  botonesDinamicos.push({
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                      display_text: url[0],
                      url: url[1],
                      merchant_url: url[1],
                    }),
                  });
                });

                list?.forEach((lister) => {
                  botonesDinamicos.push({
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({
                      title: lister[0],
                      sections: lister[1],
                    }),
                  });
                });

                /*list?.forEach(lister => {
    dynamicButtons.push({
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
            title: lister[0],
            sections: [{
		    title: lister[1],
                rows: [{
                    header: lister[2],
                    title: lister[3],
                    description: lister[4], 
                    id: lister[5]
                }]
            }]
        })
    });
});*/

                return {
                  body: proto.Message.InteractiveMessage.Body.fromObject({
                    text: text || "",
                  }),
                  footer: proto.Message.InteractiveMessage.Footer.fromObject({
                    text: footer || wm,
                  }),
                  header: proto.Message.InteractiveMessage.Header.fromObject({
                    title: text2,
                    subtitle: text || "",
                    hasMediaAttachment:
                      imagen?.imageMessage || video?.videoMessage ? true : false,
                    imageMessage: imagen?.imageMessage || null,
                    videoMessage: video?.videoMessage || null,
                  }),
                  nativeFlowMessage:
                    proto.Message.InteractiveMessage.NativeFlowMessage.fromObject(
                      {
                        buttons: botonesDinamicos.filter(Boolean),
                        messageParamsJson: "",
                      },
                    ),
                  ...Object.assign(
                    {
                      mentions:
                        typeof text === "string"
                          ? conn.parseMention(text || "@0")
                          : [],
                      contextInfo: {
                        mentionedJid:
                          typeof text === "string"
                            ? conn.parseMention(text || "@0")
                            : [],
                      },
                    },
                    {
                      ...(options || {}),
                      ...(conn.temareply?.contextInfo && {
                        contextInfo: {
                          ...(options?.contextInfo || {}),
                          ...conn.temareply?.contextInfo,
                          externalAdReply: {
                            ...(options?.contextInfo?.externalAdReply || {}),
                            ...conn.temareply?.contextInfo?.externalAdReply,
                          },
                        },
                      }),
                    },
                  ),
                };
              },
            ),
          );
          const interactiveMessage = proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.fromObject({
              text: text || "",
            }),
            footer: proto.Message.InteractiveMessage.Footer.fromObject({
              text: footer || wm,
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
              title: text || "",
              subtitle: text || "",
              hasMediaAttachment: false,
            }),
            carouselMessage:
              proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                cards: tarjetas,
              }),
            ...Object.assign(
              {
                mentions:
                  typeof text === "string"
                    ? conn.parseMention(text || "@0")
                    : [],
                contextInfo: {
                  mentionedJid:
                    typeof text === "string"
                      ? conn.parseMention(text || "@0")
                      : [],
                },
              },
              {
                ...(options || {}),
                ...(conn.temareply?.contextInfo && {
                  contextInfo: {
                    ...(options?.contextInfo || {}),
                    ...conn.temareply?.contextInfo,
                    externalAdReply: {
                      ...(options?.contextInfo?.externalAdReply || {}),
                      ...conn.temareply?.contextInfo?.externalAdReply,
                    },
                  },
                }),
              },
            ),
          });
          const contenidoMensaje = proto.Message.create({
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadata: {},
                  deviceListMetadataVersion: 2,
                },
                interactiveMessage,
              },
            },
          });
          const msgs = await generateWAMessageFromContent(jid, contenidoMensaje, {
            userJid: conn.user.jid,
            quoted: quoted,
            upload: conn.waUploadToServer,
            ephemeralExpiration: WA_DEFAULT_EPHEMERAL,
          });
          await conn.relayMessage(jid, msgs.message, {
            messageId: msgs.key.id,
          });
        } else {
          await conn.sendNCarousel(jid, ...messages[0], quoted, options);
        }
      },
    },

    // sendButton: {
    /**
     * send Button
     * @param {String} jid
     * @param {String} text
     * @param {String} footer
     * @param {Buffer} buffer
     * @param {String[] | String[][]} buttons
     * @param {import("baileys").proto.WebMessageInfo} quoted
     * @param {Object} options
     */
    /*   async value(jid, text = '', footer = '', buffer, buttons, quoted, options) {
        let tipoArchivo;
        if (Array.isArray(buffer)) (options = quoted, quoted = buttons, buttons = buffer, buffer = null);
        else if (buffer) {
          try {
            (type = await conn.getFile(buffer), buffer = type.data);
          } catch {
            buffer = null;
          }
        }
        if (!Array.isArray(buttons[0]) && typeof buttons[0] === 'string') buttons = [buttons];
        if (!options) options = {};
        const message = {
          ...options,
          [buffer ? 'caption' : 'text']: text || '',
          footer,
          buttons: buttons.map((btn) => ({
            buttonId: !nullish(btn[1]) && btn[1] || !nullish(btn[0]) && btn[0] || '',
            buttonText: {
              displayText: !nullish(btn[0]) && btn[0] || !nullish(btn[1]) && btn[1] || '',
            },
          })),
          ...(buffer ?
                        options.asLocation && /image/.test(tipoArchivo.mime) ? {
                          location: {
                            ...options,
                            jpegThumbnail: buffer,
                          },
                        } : {
                          [/video/.test(tipo.mime) ? 'video' : /image/.test(tipo.mime) ? 'image' : 'document']: buffer,
                        } : {}),
        };

        return await conn.sendMessage(jid, message, {
          quoted,
          upload: conn.waUploadToServer,
          ...options,
        });
      },
      enumerable: true,
    },*/
    
    sendButton: {
      async value(
        jid,
        text = "",
        footer = "",
        buffer,
        buttons,
        copy,
        urls,
        quoted,
        options,
      ) {
        let imagen, video;

        if (/^https?:\/\//i.test(buffer)) {
          try {
          
            const respuestaHttp = await fetch(buffer);
            const tipoContenido = respuestaHttp.headers.get("content-type");
            if (/^image\//i.test(tipoContenido)) {
              imagen = await prepareWAMessageMedia(
                { image: { url: buffer } },
                { upload: conn.waUploadToServer },
              );
            } else if (/^video\//i.test(tipoContenido)) {
              video = await prepareWAMessageMedia(
                { video: { url: buffer } },
                { upload: conn.waUploadToServer },
              );
            } else {
              console.error("Tipo MIME no compatible:", tipoContenido);
            }
          } catch (error) {
            console.error("Error al obtener el tipo MIME:", error);
          }
        } else {
          try {
            const type = await conn.getFile(buffer);
            if (/^image\//i.test(type.mime)) {
              imagen = await prepareWAMessageMedia(
                { image: { url: buffer } },
                { upload: conn.waUploadToServer },
              );
            } else if (/^video\//i.test(type.mime)) {
              video = await prepareWAMessageMedia(
                { video: { url: buffer } },
                { upload: conn.waUploadToServer },
              );
            }
          } catch (error) {
            console.error("Error al obtener el tipo de archivo:", error);
          }
        }

        const botonesDinamicos = buttons.map((btn) => ({
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: btn[0],
            id: btn[1],
          }),
        }));

        if (copy && (typeof copy === "string" || typeof copy === "number")) {
          
          botonesDinamicos.push({
            name: "cta_copy",
            buttonParamsJson: JSON.stringify({
              display_text: "Copy",
              copy_code: copy,
            }),
          });
        }

        
        if (urls && Array.isArray(urls)) {
          urls.forEach((url) => {
            botonesDinamicos.push({
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: url[0],
                url: url[1],
                merchant_url: url[1],
              }),
            });
          });
        }

        const interactiveMessage = {
          body: { text: text },
          footer: { text: footer },
          header: {
            hasMediaAttachment: false,
            imageMessage: imagen ? imagen.imageMessage : null,
            videoMessage: video ? video.videoMessage : null,
          },
          nativeFlowMessage: {
            buttons: botonesDinamicos,
            messageParamsJson: "",
          },
        };

        let msgGenerado = generateWAMessageFromContent(
          jid,
          {
            viewOnceMessage: {
              message: {
                interactiveMessage,
              },
            },
          },
          { userJid: conn.user.jid, quoted },
        );

        conn.relayMessage(jid, msgGenerado.message, {
          messageId: msgGenerado.key.id,
          ...options,
        });
      },
    },

    sendList: {
      async value(
        jid,
        title,
        text,
        buttonText,
        seccionesLista,
        quoted,
        options = {},
      ) {
        const sections = [...seccionesLista];

        const message = {
          interactiveMessage: {
            header: { title: title },
            body: { text: text },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: JSON.stringify({
                    title: buttonText,
                    sections,
                  }),
                },
              ],
              messageParamsJson: "",
            },
          },
        };
        await conn.relayMessage(jid, { viewOnceMessage: { message } }, {});
      },
    },

    /**
     * Envía mensajes interactivos con @itsliaaa/baileys (botones, listas, native flow).
     * La conexión sigue siendo @whiskeysockets/baileys.
     *
     * Ejemplo:
     * conn.sendMessageLia(jid, { text: 'Hola', footer: 'Bot', buttons: [{ text: 'OK', id: '#ok' }] }, { quoted: m })
     */
    sendMessageLia: {
      async value(jid, content, options = {}) {
        const { sendViaLia } = await import('./baileys-dual.js')
        return sendViaLia(conn, jid, content, options)
      },
      enumerable: true,
    },

    sendButtonsLia: {
      async value(jid, text = '', footer = '', buttons = [], quoted, options = {}) {
        const { sendViaLia, normalizeLiaButtons } = await import('./baileys-dual.js')
        return sendViaLia(conn, jid, {
          text,
          footer,
          buttons: normalizeLiaButtons(buttons),
        }, { quoted, ...options })
      },
      enumerable: true,
    },

    sendListLia: {
      async value(jid, title, text, buttonText, seccionesLista, quoted, options = {}) {
        const { sendViaLia, normalizeLiaListSections } = await import('./baileys-dual.js')
        return sendViaLia(conn, jid, {
          text,
          footer: options.footer || global.packname || '',
          buttonText,
          title,
          sections: normalizeLiaListSections(seccionesLista),
        }, { quoted, ...options })
      },
      enumerable: true,
    },

    sendInteractiveLia: {
      async value(jid, content, quoted, options = {}) {
        const { sendViaLia } = await import('./baileys-dual.js')
        return sendViaLia(conn, jid, content, { quoted, ...options })
      },
      enumerable: true,
    },

    sendEvent: {
      async value(jid, text, des, loc, link) {
        let msg = generateWAMessageFromContent(
          jid,
          {
            messageContextInfo: {
              messageSecret: randomBytes(32),
            },
            eventMessage: {
              isCanceled: false,
              name: text,
              description: des,
              location: {
                degreesLatitude: 0,
                degreesLongitude: 0,
                name: loc,
              },
              joinLink: link,
              startTime: "m.messageTimestamp",
            },
          },
          {},
        );

        conn.relayMessage(jid, msg.message, {
          messageId: msg.key.id,
        });
      },
      enumerable: true,
    },

    sendPoll: {
      async value(jid, name = "", opcionesEncuesta, options) {
        if (!Array.isArray(opcionesEncuesta[0]) && typeof opcionesEncuesta[0] === "string")
          opcionesEncuesta = [opcionesEncuesta];
        if (!options) options = {};
        const mensajeEncuesta = {
          name: name,
          options: opcionesEncuesta.map((btn) => ({
            optionName: (!esNulo(btn[0]) && btn[0]) || "",
          })),
          selectableOptionsCount: 1,
        };
        return conn.relayMessage(
          jid,
          { pollCreationMessage: mensajeEncuesta },
          { ...options },
        );
      },
    },
    sendHydrated: {
      /**
       *
       * @param {String} jid
       * @param {String} text
       * @param {String} footer
       * @param {fs.PathLike} buffer
       * @param {String|string[]} url
       * @param {String|string[]} urlText
       * @param {String|string[]} call
       * @param {String|string[]} callText
       * @param {String[][]} buttons
       * @param {import("baileys").proto.WebMessageInfo} quoted
       * @param {Object} options
       */
      async value(
        jid,
        text = "",
        footer = "",
        buffer,
        url,
        textoUrl,
        call,
        textoLlamada,
        buttons,
        quoted,
        options,
      ) {
        let tipoArchivo;
        if (buffer) {
          try {
            ((tipoArchivo = await conn.getFile(buffer)), (buffer = tipoArchivo.data));
          } catch {
            buffer = buffer;
          }
        }
        if (
          buffer &&
          !Buffer.isBuffer(buffer) &&
          (typeof buffer === "string" || Array.isArray(buffer))
        )
          ((options = quoted),
            (quoted = buttons),
            (buttons = textoLlamada),
            (textoLlamada = call),
            (call = textoUrl),
            (textoUrl = url),
            (url = buffer),
            (buffer = null));
        if (!options) options = {};
        const botonesPlantilla = [];
        if (url || textoUrl) {
          if (!Array.isArray(url)) url = [url];
          if (!Array.isArray(textoUrl)) textoUrl = [textoUrl];
          botonesPlantilla.push(
            ...(url
              .map((v, i) => [v, textoUrl[i]])
              .map(([url, textoUrl], i) => ({
                index: botonesPlantilla.length + i + 1,
                urlButton: {
                  displayText:
                    (!esNulo(textoUrl) && textoUrl) ||
                    (!esNulo(url) && url) ||
                    "",
                  url:
                    (!esNulo(url) && url) ||
                    (!esNulo(textoUrl) && textoUrl) ||
                    "",
                },
              })) || []),
          );
        }
        if (call || textoLlamada) {
          if (!Array.isArray(call)) call = [call];
          if (!Array.isArray(textoLlamada)) textoLlamada = [textoLlamada];
          botonesPlantilla.push(
            ...(call
              .map((v, i) => [v, textoLlamada[i]])
              .map(([call, textoLlamada], i) => ({
                index: botonesPlantilla.length + i + 1,
                callButton: {
                  displayText:
                    (!esNulo(textoLlamada) && textoLlamada) ||
                    (!esNulo(call) && call) ||
                    "",
                  phoneNumber:
                    (!esNulo(call) && call) ||
                    (!esNulo(textoLlamada) && textoLlamada) ||
                    "",
                },
              })) || []),
          );
        }
        if (buttons.length) {
          if (!Array.isArray(buttons[0])) buttons = [buttons];
          botonesPlantilla.push(
            ...(buttons.map(([text, id], index) => ({
              index: botonesPlantilla.length + index + 1,
              quickReplyButton: {
                displayText:
                  (!esNulo(text) && text) || (!esNulo(id) && id) || "",
                id: (!esNulo(id) && id) || (!esNulo(text) && text) || "",
              },
            })) || []),
          );
        }
        const message = {
          ...options,
          [buffer ? "caption" : "text"]: text || "",
          footer,
          templateButtons: botonesPlantilla,
          ...(buffer
            ? options.asLocation && /image/.test(tipoArchivo.mime)
              ? {
                  location: {
                    ...options,
                    jpegThumbnail: buffer,
                  },
                }
              : {
                  [/video/.test(tipoArchivo.mime)
                    ? "video"
                    : /image/.test(tipoArchivo.mime)
                      ? "image"
                      : "document"]: buffer,
                }
            : {}),
        };
        return await conn.sendMessage(jid, message, {
          quoted,
          upload: conn.waUploadToServer,
          ...options,
        });
      },
      enumerable: true,
    },
    sendHydrated2: {
      /**
       *
       * @param {String} jid
       * @param {String} text
       * @param {String} footer
       * @param {fs.PathLike} buffer
       * @param {String|string[]} url
       * @param {String|string[]} urlText
       * @param {String|string[]} call
       * @param {String|string[]} callText
       * @param {String[][]} buttons
       * @param {import("baileys").proto.WebMessageInfo} quoted
       * @param {Object} options
       */
      async value(
        jid,
        text = "",
        footer = "",
        buffer,
        url,
        textoUrl,
        url2,
        textoUrl2,
        buttons,
        quoted,
        options,
      ) {
        let tipoArchivo;
        if (buffer) {
          try {
            ((tipoArchivo = await conn.getFile(buffer)), (buffer = tipoArchivo.data));
          } catch {
            buffer = buffer;
          }
        }
        if (
          buffer &&
          !Buffer.isBuffer(buffer) &&
          (typeof buffer === "string" || Array.isArray(buffer))
        )
          ((options = quoted),
            (quoted = buttons),
            (buttons = textoLlamada),
            (textoLlamada = call),
            (call = textoUrl),
            (textoUrl = url),
            (url = buffer),
            (buffer = null));
        if (!options) options = {};
        const botonesPlantilla = [];
        if (url || textoUrl) {
          if (!Array.isArray(url)) url = [url];
          if (!Array.isArray(textoUrl)) textoUrl = [textoUrl];
          botonesPlantilla.push(
            ...(url
              .map((v, i) => [v, textoUrl[i]])
              .map(([url, textoUrl], i) => ({
                index: botonesPlantilla.length + i + 1,
                urlButton: {
                  displayText:
                    (!esNulo(textoUrl) && textoUrl) ||
                    (!esNulo(url) && url) ||
                    "",
                  url:
                    (!esNulo(url) && url) ||
                    (!esNulo(textoUrl) && textoUrl) ||
                    "",
                },
              })) || []),
          );
        }
        if (url2 || textoUrl2) {
          if (!Array.isArray(url2)) url2 = [url2];
          if (!Array.isArray(textoUrl2)) textoUrl2 = [textoUrl2];
          botonesPlantilla.push(
            ...(url2
              .map((v, i) => [v, textoUrl2[i]])
              .map(([url2, textoUrl2], i) => ({
                index: botonesPlantilla.length + i + 1,
                urlButton: {
                  displayText:
                    (!esNulo(textoUrl2) && textoUrl2) ||
                    (!esNulo(url2) && url2) ||
                    "",
                  url:
                    (!esNulo(url2) && url2) ||
                    (!esNulo(textoUrl2) && textoUrl2) ||
                    "",
                },
              })) || []),
          );
        }
        if (buttons.length) {
          if (!Array.isArray(buttons[0])) buttons = [buttons];
          botonesPlantilla.push(
            ...(buttons.map(([text, id], index) => ({
              index: botonesPlantilla.length + index + 1,
              quickReplyButton: {
                displayText:
                  (!esNulo(text) && text) || (!esNulo(id) && id) || "",
                id: (!esNulo(id) && id) || (!esNulo(text) && text) || "",
              },
            })) || []),
          );
        }
        const message = {
          ...options,
          [buffer ? "caption" : "text"]: text || "",
          footer,
          templateButtons: botonesPlantilla,
          ...(buffer
            ? options.asLocation && /image/.test(tipoArchivo.mime)
              ? {
                  location: {
                    ...options,
                    jpegThumbnail: buffer,
                  },
                }
              : {
                  [/video/.test(tipoArchivo.mime)
                    ? "video"
                    : /image/.test(tipoArchivo.mime)
                      ? "image"
                      : "document"]: buffer,
                }
            : {}),
        };
        return await conn.sendMessage(jid, message, {
          quoted,
          upload: conn.waUploadToServer,
          ...options,
        });
      },
      enumerable: true,
    },
    cMod: {
      /**
       * Modifica una copia del mensaje (cMod)
       * @param {String} jid
       * @param {import("baileys").proto.WebMessageInfo} message
       * @param {String} text
       * @param {String} sender
       * @param {*} options
       * @returns
       */
      value(jid, message, text = "", sender = conn.user.jid, options = {}) {
        if (options.mentions && !Array.isArray(options.mentions))
          options.mentions = [options.mentions];
        const copy = message.toJSON();
        delete copy.message.messageContextInfo;
        delete copy.message.senderKeyDistributionMessage;
        const tipoMsg = Object.keys(copy.message)[0];
        const msg = copy.message;
        const content = msg[tipoMsg];
        if (typeof content === "string") msg[tipoMsg] = text || content;
        else if (content.caption) content.caption = text || content.caption;
        else if (content.text) content.text = text || content.text;
        if (typeof content !== "string") {
          msg[tipoMsg] = { ...content, ...options };
          msg[tipoMsg].contextInfo = {
            ...(content.contextInfo || {}),
            mentionedJid:
              options.mentions || content.contextInfo?.mentionedJid || [],
          };
        }
        if (copy.participant)
          sender = copy.participant = sender || copy.participant;
        else if (copy.key.participant)
          sender = copy.key.participant = sender || copy.key.participant;
        if (copy.key.remoteJid.includes("@s.whatsapp.net"))
          sender = sender || copy.key.remoteJid;
        else if (copy.key.remoteJid.includes("@broadcast"))
          sender = sender || copy.key.remoteJid;
        copy.key.remoteJid = jid;
        copy.key.fromMe = areJidsSameUser(sender, conn.user.id) || false;
        return proto.WebMessageInfo.fromObject(copy);
      },
      enumerable: true,
    },
    copyNForward: {
      /**
       * Reenvío copia exacta
       * @param {String} jid
       * @param {import("baileys").proto.WebMessageInfo} message
       * @param {Boolean|Number} forwardingScore
       * @param {Object} options
       */
      async value(jid, message, puntuacionReenvio = true, options = {}) {
        let tipoVista;
        if (options.readViewOnce && message.message.viewOnceMessage?.message) {
          tipoVista = Object.keys(message.message.viewOnceMessage.message)[0];
          delete message.message.viewOnceMessage.message[tipoVista].viewOnce;
          message.message = proto.Message.fromObject(
            JSON.parse(JSON.stringify(message.message.viewOnceMessage.message)),
          );
          message.message[tipoVista].contextInfo =
            message.message.viewOnceMessage.contextInfo;
        }
        const tipoMsg = Object.keys(message.message)[0];
        let m = generateForwardMessageContent(message, !!puntuacionReenvio);
        const tipoContenidoFwd = Object.keys(m)[0];
        if (
          puntuacionReenvio &&
          typeof puntuacionReenvio === "number" &&
          puntuacionReenvio > 1
        )
          m[tipoContenidoFwd].contextInfo.forwardingScore += puntuacionReenvio;
        m[tipoContenidoFwd].contextInfo = {
          ...(message.message[tipoMsg].contextInfo || {}),
          ...(m[tipoContenidoFwd].contextInfo || {}),
        };
        m = generateWAMessageFromContent(jid, m, {
          ...options,
          userJid: conn.user.jid,
        });
        await conn.relayMessage(jid, m.message, {
          messageId: m.key.id,
          additionalAttributes: { ...options },
        });
        return m;
      },
      enumerable: true,
    },
    fakeReply: {
      /**
       * Respuesta falsa (fake reply)
       * @param {String} jid
       * @param {String|Object} text
       * @param {String} fakeJid
       * @param {String} fakeText
       * @param {String} fakeGroupJid
       * @param {String} options
       */
      value(
        jid,
        text = "",
        jidFalso = this.user.jid,
        textoFalso = "",
        jidGrupoFalso,
        options,
      ) {
        return conn.reply(jid, text, {
          key: {
            fromMe: areJidsSameUser(jidFalso, conn.user.id),
            participant: jidFalso,
            ...(jidGrupoFalso ? { remoteJid: jidGrupoFalso } : {}),
          },
          message: { conversation: textoFalso },
          ...options,
        });
      },
    },
    downloadM: {
      /**
       * Descarga el media de un mensaje
       * @param {Object} m
       * @param {String} type
       * @param {fs.PathLike | fs.promises.FileHandle} saveToFile
       * @return {Promise<fs.PathLike | fs.promises.FileHandle | Buffer>}
       */
      async value(m, type, guardarEnArchivo) {
        let nombreArchivo;
        if (!m || !(m.url || m.directPath)) return Buffer.alloc(0);
        const flujo = await downloadContentFromMessage(m, type);
        let buffer = Buffer.from([]);
        for await (const trozo of flujo) {
          buffer = Buffer.concat([buffer, trozo]);
        }
        if (guardarEnArchivo)
          ({ filename: nombreArchivo } = await conn.getFile(buffer, true));
        return guardarEnArchivo && fs.existsSync(nombreArchivo)
          ? nombreArchivo
          : buffer;
      },
      enumerable: true,
    },
    parseMention: {
      value(text = "") {
        try {
          const esNumeroValido = (numero) => {
            const len = numero.length;
            if (len < 8 || len > 13) return false; 
            if (len > 10 && numero.startsWith("9")) return false;
            const codigosValidos = ["1","7","20","27","30","31","32","33","34","36","39","40","41","43","44","45","46","47","48","49","51","52","53","54","55","56","57","58","60","61","62","63","64","65","66","81","82","84","86","90","91","92","93","94","95","98","211","212","213","216","218","220","221","222","223","224","225","226","227","228","229","230","231","232","233","234","235","236","237","238","239","240","241","242","243","244","245","246","248","249","250","251","252","253","254","255","256","257","258","260","261","262","263","264","265","266","267","268","269","290","291","297","298","299","350","351","352","353","354","355","356","357","358","359","370","371","372","373","374","375","376","377","378","379","380","381","382","383","385","386","387","389","420","421","423","500","501","502","503","504","505","506","507","508","509","590","591","592","593","594","595","596","597","598","599","670","672","673","674","675","676","677","678","679","680","681","682","683","685","686","687","688","689","690","691","692","850","852","853","855","856","880","886","960","961","962","963","964","965","966","967","968","970","971","972","973","974","975","976","977","978","979","992","993","994","995","996","998"]; 
            return codigosValidos.some((codigo) => numero.startsWith(codigo));
          };
          return (text.match(/@(\d{5,20})/g) || []).map((m) => m.substring(1)).map((numero) => esNumeroValido(numero) ? `${numero}@s.whatsapp.net` : `${numero}@lid`, );
        } catch (error) {
          console.error("Error:", error);
          return [];
        }
      },
      enumerable: true,
    },
    getName: {
      /**
       * Obtiene el nombre desde un jid
       * @param {String} jid
       * @param {Boolean} withoutContact
       */
      value(jid = "", sinContacto = false) {
        try {
          if (
            !jid ||
            typeof jid !== "string" ||
            jid.includes("No SenderKeyRecord")
          )
            return "";
          jid = conn.decodeJid(jid);
          sinContacto = conn.withoutContact || sinContacto;
          let v;
          if (jid.endsWith("@g.us")) {
            return new Promise(async (resolve) => {
              try {
                v = conn.chats[jid] || {};
                if (!(v.name || v.subject))
                  v = await conn?.groupMetadata(jid).catch(() => ({}));
                resolve(
                  v.name ||
                    v.subject ||
                    PhoneNumber(
                      "+" + jid.replace("@s.whatsapp.net", ""),
                    ).getNumber("international"),
                );
              } catch (e) {
                resolve("");
              }
            });
          } else {
            v =
              jid === "0@s.whatsapp.net"
                ? { jid, vname: "WhatsApp" }
                : areJidsSameUser(jid, conn.user.id)
                  ? conn.user
                  : conn.chats[jid] || {};
            return (
              (sinContacto ? "" : v.name) ||
              v.subject ||
              v.vname ||
              v.notify ||
              v.verifiedName ||
              PhoneNumber("+" + jid.replace("@s.whatsapp.net", "")).getNumber(
                "international",
              )
            );
          }
        } catch (error) {
          return "";
        }
      },
    },
    loadMessage: {
      /**
       *
       * @param {String} messageID
       * @returns {import("baileys").proto.WebMessageInfo}
       */
      value(idMensaje) {
        return Object.entries(conn.chats)
          .filter(([_, { messages }]) => typeof messages === "object")
          .find(([_, { messages }]) =>
            Object.entries(messages).find(
              ([k, v]) => k === idMensaje || v.key?.id === idMensaje,
            ),
          )?.[1].messages?.[idMensaje];
      },
      enumerable: true,
    },
    sendGroupV4Invite: {
      /**
       * Envía invitación de grupo v4
       * @param {String} jid
       * @param {*} participant
       * @param {String} inviteCode
       * @param {Number} inviteExpiration
       * @param {String} groupName
       * @param {String} caption
       * @param {Buffer} jpegThumbnail
       * @param {*} options
       */
      async value(
        jid,
        participant,
        inviteCode,
        inviteExpiration,
        groupName = "unknown subject",
        caption = "Invitation to join my WhatsApp group",
        jpegThumbnail,
        options = {},
      ) {
        const msg = proto.Message.fromObject({
          groupInviteMessage: proto.GroupInviteMessage.fromObject({
            inviteCode,
            inviteExpiration:
              parseInt(inviteExpiration) ||
              +new Date(new Date() + 3 * 86400000),
            groupJid: jid,
            groupName:
              (groupName ? groupName : await conn.getName(jid)) || null,
            jpegThumbnail: Buffer.isBuffer(jpegThumbnail)
              ? jpegThumbnail
              : null,
            caption,
          }),
        });
        const message = generateWAMessageFromContent(participant, msg, options);
        await conn.relayMessage(participant, message.message, {
          messageId: message.key.id,
          additionalAttributes: { ...options },
        });
        return message;
      },
      enumerable: true,
    },
    processMessageStubType: {
      /**
       * Procesa MessageStubType
       * @param {import("baileys").proto.WebMessageInfo} m
       */
      async value(m) {
        if (!m.messageStubType) return;
        const chat = conn.decodeJid(
          m.key.remoteJid ||
            m.message?.senderKeyDistributionMessage?.groupId ||
            "",
        );
        if (!chat || chat === "status@broadcast") return;
        const emitirActualizacionGrupo = (update) => {
          conn.ev.emit("groups.update", [{ id: chat, ...update }]);
        };
        const paramsStub = m.messageStubParameters || [];
        switch (m.messageStubType) {
          case WAMessageStubType.REVOKE:
          case WAMessageStubType.GROUP_CHANGE_INVITE_LINK:
            if (paramsStub[0]) emitirActualizacionGrupo({ revoke: paramsStub[0] });
            break;
          case WAMessageStubType.GROUP_CHANGE_ICON:
            if (paramsStub[0]) emitirActualizacionGrupo({ icon: paramsStub[0] });
            break;
          default: {
            console.log({
              messageStubType: m.messageStubType,
              messageStubParameters: m.messageStubParameters,
              type: WAMessageStubType[m.messageStubType],
            });
            break;
          }
        }
        const isGroup = chat.endsWith("@g.us");
        if (!isGroup) return;
        let chats = conn.chats[chat];
        if (!chats) chats = conn.chats[chat] = { id: chat };
        chats.isChats = true;
        const metadata = await conn.groupMetadata(chat).catch((_) => null);
        if (!metadata) return;
        chats.subject = metadata.subject;
        chats.metadata = metadata;
      },
    },
    insertAllGroup: {
      async value() {
        const groups =
          (await conn.groupFetchAllParticipating().catch((_) => null)) || {};
        for (const group in groups)
          conn.chats[group] = {
            ...(conn.chats[group] || {}),
            id: group,
            subject: groups[group].subject,
            isChats: true,
            metadata: groups[group],
          };
        return conn.chats;
      },
    },
    pushMessage: {
      /**
       * Inserta mensajes en el caché de chats
       * @param {import("baileys").proto.WebMessageInfo[]} m
       */
      async value(m) {
        if (!m) return;
        if (!Array.isArray(m)) m = [m];
        for (const message of m) {
          try {

            if (!message) continue;
            if (
              message.messageStubType &&
              message.messageStubType != WAMessageStubType.CIPHERTEXT
            )
              conn.processMessageStubType(message).catch(console.error);
            const _mtype = Object.keys(message.message || {});
            const tipoMsg =
              (!["senderKeyDistributionMessage", "messageContextInfo"].includes(
                _mtype[0],
              ) &&
                _mtype[0]) ||
              (_mtype.length >= 3 &&
                _mtype[1] !== "messageContextInfo" &&
                _mtype[1]) ||
              _mtype[_mtype.length - 1];
            const chat = conn.decodeJid(
              message.key.remoteJid ||
                message.message?.senderKeyDistributionMessage?.groupId ||
                "",
            );
            if (message.message?.[tipoMsg]?.contextInfo?.quotedMessage) {
              /**
               * @type {import("baileys").proto.IContextInfo}
               */
              const context = message.message[tipoMsg].contextInfo;
              let participant = conn.decodeJid(context.participant);
              const remoteJid = conn.decodeJid(
                context.remoteJid || participant,
              );
              /**
               * @type {import("baileys").proto.IMessage}
               *
               */
              const quoted = message.message[tipoMsg].contextInfo.quotedMessage;
              if (remoteJid && remoteJid !== "status@broadcast" && quoted) {
                let tipoMsgCitado = Object.keys(quoted)[0];
                if (tipoMsgCitado == "conversation") {
                  quoted.extendedTextMessage = { text: quoted[tipoMsgCitado] };
                  delete quoted.conversation;
                  tipoMsgCitado = "extendedTextMessage";
                }
                if (!quoted[tipoMsgCitado].contextInfo)
                  quoted[tipoMsgCitado].contextInfo = {};
                quoted[tipoMsgCitado].contextInfo.mentionedJid =
                  context.mentionedJid ||
                  quoted[tipoMsgCitado].contextInfo.mentionedJid ||
                  [];
                const isGroup = remoteJid.endsWith("g.us");
                if (isGroup && !participant) participant = remoteJid;
                const qM = {
                  key: {
                    remoteJid,
                    fromMe: areJidsSameUser(conn.user.jid, remoteJid),
                    id: context.stanzaId,
                    participant,
                  },
                  message: JSON.parse(JSON.stringify(quoted)),
                  ...(isGroup ? { participant } : {}),
                };
                let chatsCitados = conn.chats[participant];
                if (!chatsCitados)
                  chatsCitados = conn.chats[participant] = {
                    id: participant,
                    isChats: !isGroup,
                  };
                if (!chatsCitados.messages) chatsCitados.messages = {};
                if (!chatsCitados.messages[context.stanzaId] && !qM.key.fromMe)
                  chatsCitados.messages[context.stanzaId] = qM;
                let mensajesChatsCitados;
                if (
                  (mensajesChatsCitados = Object.entries(chatsCitados.messages)).length > 40
                )
                  chatsCitados.messages = Object.fromEntries(
                    mensajesChatsCitados.slice(30, mensajesChatsCitados.length),
                  ); 
              }
            }
            if (!chat || chat === "status@broadcast") continue;
            const isGroup = chat.endsWith("@g.us");

            if (
              isGroup &&
              message.message &&
              !message.key?.fromMe &&
              message.messageStubType != WAMessageStubType.CIPHERTEXT
            ) {
              markViewOnceMessage(message);
              cacheViewOnceRaw(message);
            }

            let chats = conn.chats[chat];
            if (!chats) {
              if (isGroup) await conn.insertAllGroup().catch(console.error);
              chats = conn.chats[chat] = {
                id: chat,
                isChats: true,
                ...(conn.chats[chat] || {}),
              };
            }
            let metadata;
            let sender;
            if (isGroup) {
              if (!chats.subject || !chats.metadata) {
                metadata =
                  (await conn.groupMetadata(chat).catch((_) => ({}))) || {};
                if (!chats.subject) chats.subject = metadata.subject || "";
                if (!chats.metadata) chats.metadata = metadata;
              }
              sender = conn.decodeJid(
                (message.key?.fromMe && conn.user.id) ||
                  message.participant ||
                  message.key?.participant ||
                  chat ||
                  "",
              );
              if (sender !== chat) {
                let chats = conn.chats[sender];
                if (!chats) chats = conn.chats[sender] = { id: sender };
                if (!chats.name)
                  chats.name = message.pushName || chats.name || "";
              }
            } else if (!chats.name)
              chats.name = message.pushName || chats.name || "";
            if (
              ["senderKeyDistributionMessage", "messageContextInfo"].includes(
                tipoMsg,
              )
            )
              continue;
            chats.isChats = true;
            if (!chats.messages) chats.messages = {};
            const fromMe =
              message.key.fromMe ||
              areJidsSameUser(sender || chat, conn.user.id);
            if (
              !["protocolMessage"].includes(tipoMsg) &&
              !fromMe &&
              message.messageStubType != WAMessageStubType.CIPHERTEXT &&
              message.message
            ) {
              delete message.message.messageContextInfo;
              delete message.message.senderKeyDistributionMessage;
              chats.messages[message.key.id] = JSON.parse(
                JSON.stringify(message, null, 2),
              );
              let mensajesChat;
              if ((mensajesChat = Object.entries(chats.messages)).length > 40)
                chats.messages = Object.fromEntries(
                  mensajesChat.slice(30, mensajesChat.length),
                );

            }
          } catch (e) {
            console.error(e);
          }
        }
      },
    },
    serializeM: {
      /**
       * Serializa un mensaje para manipularlo más fácil
       * @param {import("baileys").proto.WebMessageInfo} m
       */
      value(m) {
        return smsg(conn, m);
      },
    },
    ...(typeof conn.chatRead !== "function"
      ? {
          chatRead: {
            /**
             * Marca mensaje como leído
             * @param {String} jid
             * @param {String|undefined|null} participant
             * @param {String} messageID
             */
            value(jid, participant = conn.user.jid, idMensaje) {
              return conn.sendReadReceipt(jid, participant, [idMensaje]);
            },
            enumerable: true,
          },
        }
      : {}),
    ...(typeof conn.setStatus !== "function"
      ? {
          setStatus: {
            /**
             * Establece el estado del bot
             * @param {String} status
             */
            value(status) {
              return conn.query({
                tag: "iq",
                attrs: {
                  to: S_WHATSAPP_NET,
                  type: "set",
                  xmlns: "status",
                },
                content: [
                  {
                    tag: "status",
                    attrs: {},
                    content: Buffer.from(status, "utf-8"),
                  },
                ],
              });
            },
            enumerable: true,
          },
        }
      : {}),
  });
  if (sock.user?.id) sock.user.jid = sock.decodeJid(sock.user.id);
  store.bind(sock);
  return sock;
}
/**
 * Serialize Message
 * @param {ReturnType<typeof makeWASocket>} conn
 * @param {import("baileys").proto.WebMessageInfo} m
 * @param {Boolean} hasParent
 */
export function smsg(conn, m, tienePadre) {
  if (!m) return m;
  const M = proto.WebMessageInfo;
  try {
    m = M.create(m);
    m.conn = conn;
    let claveMensajeProtocolo;
    if (m.message) {
      if (m.mtype == "protocolMessage" && m.msg?.key) {
        claveMensajeProtocolo = m.msg.key;
        if (claveMensajeProtocolo.remoteJid === "status@broadcast") {
          claveMensajeProtocolo.remoteJid = m.chat || "";
        }
        if (
          !claveMensajeProtocolo.participant ||
          claveMensajeProtocolo.participant === "status_me"
        ) {
          claveMensajeProtocolo.participant =
            typeof m.sender === "string" ? m.sender : "";
        }
        const participanteDecodificado =
          conn?.decodeJid?.(claveMensajeProtocolo.participant) || "";
        claveMensajeProtocolo.fromMe =
          participanteDecodificado === (conn?.user?.id || "");
        if (
          !claveMensajeProtocolo.fromMe &&
          claveMensajeProtocolo.remoteJid === (conn?.user?.id || "")
        ) {
          claveMensajeProtocolo.remoteJid =
            typeof m.sender === "string" ? m.sender : "";
        }
      }
      if (m.quoted && !m.quoted.mediaMessage) {
        delete m.quoted.download;
      }
    }
    if (!m.mediaMessage) {
      delete m.download;
    }
    if (claveMensajeProtocolo && m.mtype == "protocolMessage") {
      try {
        conn.ev.emit("message.delete", claveMensajeProtocolo);
      } catch (e) {
        console.error("Error al emitir message.delete:", e);
      }
    }
    return m;
  } catch (e) {
    console.error("Error en smsg:", e);
    return m;
  }
}


export function serialize() {
  const TiposMedia = ["imageMessage", "videoMessage", "audioMessage", "stickerMessage", "documentMessage",];
  const terminaConSeguro = (str, suffix) =>
    typeof str === "string" && str.endsWith(suffix);
  const decodificarJidSeguro = (jid, conn) => {
    try {
      if (!jid || typeof jid !== "string") return "";
      return conn?.decodeJid?.(jid) || jid;
    } catch (e) {
      console.error("Error en safeDecodeJid:", e);
      return "";
    }
  };
  const dividirSeguro = (str, separator) =>
    typeof str === "string" ? str.split(separator) : [];
  return Object.defineProperties(proto.WebMessageInfo.prototype, {
    conn: {
      value: undefined,
      enumerable: false,
      writable: true,
    },
    id: {
      get() {
        try {
          return this.key?.id || "";
        } catch (e) {
          console.error("Error en id getter:", e);
          return "";
        }
      },
      enumerable: true,
    },
    isBaileys: {
      get() {
        try {
          const idUsuario = this.conn?.user?.id || "";
          const sender = this.sender || "";
          return (
            ((this?.fromMe || areJidsSameUser(idUsuario, sender)) &&
              this.id?.startsWith?.("3EB0") &&
              [20, 22, 12].includes(this.id?.length)) ||
            false
          );
        } catch (e) {
          console.error("Error en isBaileys getter:", e);
          return false;
        }
      },
      enumerable: true,
    },
    chat: {
      get() {
        try {
          const senderKeyDistributionMessage =
            this.message?.senderKeyDistributionMessage?.groupId;
          const jidCrudo =
            this.key?.remoteJid ||
            (senderKeyDistributionMessage &&
              senderKeyDistributionMessage !== "status@broadcast") ||
            "";
          return decodificarJidSeguro(jidCrudo, this.conn);
        } catch (e) {
          console.error("Error en chat getter:", e);
          return "";
        }
      },
      enumerable: true,
    },
    isGroup: {
      get() {
        try {
          return terminaConSeguro(this.chat, "@g.us");
        } catch (e) {
          console.error("Error en isGroup getter:", e);
          return false;
        }
      },
      enumerable: true,
    },
    isNewsletter: {
      get() {
        try {
          return terminaConSeguro(this.chat, "@newsletter");
        } catch (e) {
          console.error("Error en isNewsletter getter:", e);
          return false;
        }
      },
      enumerable: true,
    },
    sender: {
      get() {
        try {
          // Baileys 7: si el primary es @lid, el PN suele venir en participantAlt / remoteJidAlt
          const alt = this.key?.participantAlt || this.key?.remoteJidAlt
          if (alt && (String(alt).endsWith('@s.whatsapp.net') || String(alt).endsWith('@c.us'))) {
            return this.conn?.decodeJid(alt) || alt
          }

          const primary = this.key?.fromMe && this.conn?.user.id
            || this.participant
            || this.key?.participant
            || this.chat
            || ''
          return this.conn?.decodeJid(primary) || primary
        } catch (e) {
          console.error('Error en sender getter:', e)
          return ''
        }
      },
      enumerable: true,
    },
    /*sender: {
      get() {
        if (this.messageStubType) {
          if (this.messageStubType === 32) { 
            return this.messageStubParameters?.[0] || this.key?.remoteJid || '';
          } else if (this.messageStubType === 20) { 
            return this.key?.participant || this.key?.remoteJid || '';
          } else { 
            return this.key?.participant || this.key?.remoteJid || '';
          }
        }
        const parse1 = (this.participant || this.key.participant || this.chat || '').decodeJid();
        if (parse1 && parse1.includes('@lid')) {
          return parse1.resolveLidToRealJid(this.chat, mconn.conn);
        }
        return this.conn?.decodeJid(this.key?.fromMe && this.conn?.user.id || this.participant || this.key.participant || this.chat || '');
      },
      enumerable: true,
    },*/
    fromMe: {
      get() {
        try {
          const idUsuario = this.conn?.user?.id || "";
          const sender = this.sender || "";
          return this.key?.fromMe || areJidsSameUser(idUsuario, sender) || false;
        } catch (e) {
          console.error("Error en fromMe getter:", e);
          return false;
        }
      },
      enumerable: true,
    },
    mtype: {
      get() {
        try {
          if (!this.message) return "";
          const type = Object.keys(this.message);

          if (
            !["senderKeyDistributionMessage", "messageContextInfo"].includes(
              type[0],
            )
          ) {
            return type[0];
          }

          if (type.length >= 3 && type[1] !== "messageContextInfo") {
            return type[1];
          }

          return type[type.length - 1];
        } catch (e) {
          console.error("Error en mtype getter:", e);
          return "";
        }
      },
      enumerable: true,
    },
    msg: {
      get() {
        try {
          if (!this.message) return null;
          return this.message[this.mtype] || null;
        } catch (e) {
          console.error("Error en msg getter:", e);
          return null;
        }
      },
      enumerable: true,
    },
    mediaMessage: {
      get() {
        try {
          if (!this.message) return null;

          const Message =
            (this.msg?.url || this.msg?.directPath
              ? { ...this.message }
              : extractMessageContent(this.message)) || null;
          if (!Message) return null;

          const tipoMsg = Object.keys(Message)[0];
          return TiposMedia.includes(tipoMsg) ? Message : null;
        } catch (e) {
          console.error("Error en mediaMessage getter:", e);
          return null;
        }
      },
      enumerable: true,
    },
    mediaType: {
      get() {
        try {
          const message = this.mediaMessage;
          if (!message) return null;
          return Object.keys(message)[0];
        } catch (e) {
          console.error("Error en mediaType getter:", e);
          return null;
        }
      },
      enumerable: true,
    },
    quoted: {
      get() {
        try {
          const self = this;
          const msg = self.msg;
          const contextInfo = msg?.contextInfo;
          const quoted = contextInfo?.quotedMessage;

          if (!msg || !contextInfo || !quoted) return null;

          const type = Object.keys(quoted)[0];
          const q = quoted[type];
          const text = typeof q === "string" ? q : q?.text || "";

          return Object.defineProperties(
            JSON.parse(
              JSON.stringify(typeof q === "string" ? { text: q } : q || {}),
            ),
            {
              mtype: {
                get() {
                  return type;
                },
                enumerable: true,
              },
              mediaMessage: {
                get() {
                  const Message =
                    (q?.url || q?.directPath
                      ? { ...quoted }
                      : extractMessageContent(quoted)) || null;
                  if (!Message) return null;
                  const tipoMsg = Object.keys(Message)[0];
                  return TiposMedia.includes(tipoMsg) ? Message : null;
                },
                enumerable: true,
              },
              mediaType: {
                get() {
                  const message = this.mediaMessage;
                  if (!message) return null;
                  return Object.keys(message)[0];
                },
                enumerable: true,
              },
              id: {
                get() {
                  return contextInfo.stanzaId || "";
                },
                enumerable: true,
              },
              chat: {
                get() {
                  return contextInfo.remoteJid || self.chat || "";
                },
                enumerable: true,
              },
              isBaileys: {
                get() {
                  const idUsuario = self.conn?.user?.id || "";
                  const sender = this.sender || "";
                  return (
                    ((this?.fromMe || areJidsSameUser(idUsuario, sender)) &&
                      this.id?.startsWith?.("3EB0") &&
                      [20, 22, 12].includes(this.id?.length)) ||
                    false
                  );
                },
                enumerable: true,
              },
              sender: {
                get() {
                  try {
                    const participanteCrudo = contextInfo.participant;
                    if (!participanteCrudo) {
                      const isFromMe =
                        this.key?.fromMe ||
                        areJidsSameUser(this.chat, self.conn?.user?.id || "");
                      return isFromMe
                        ? decodificarJidSeguro(self.conn?.user?.id, self.conn)
                        : this.chat;
                    }
                    const jidParseado = decodificarJidSeguro(participanteCrudo, self.conn);
                    return (
                      jidParseado?.resolveLidToRealJid(this.chat, self.conn) ||
                      jidParseado
                    );
                  } catch (e) {
                    console.error("Error en quoted sender getter:", e);
                    return "";
                  }
                },
                enumerable: true,
              },
              fromMe: {
                get() {
                  const sender = this.sender || "";
                  const userJid = self.conn?.user?.jid || "";
                  return areJidsSameUser(sender, userJid);
                },
                enumerable: true,
              },
              text: {
                get() {
                  return (
                    text ||
                    this.caption ||
                    this.contentText ||
                    this.selectedDisplayText ||
                    ""
                  );
                },
                enumerable: true,
              },
              mentionedJid: {
                get() {
                  const mentioned =
                    q?.contextInfo?.mentionedJid ||
                    self.getQuotedObj()?.mentionedJid ||
                    [];
                  return mentioned
                    .map((user) => {
                      if (user && typeof user === "object") {
                        user = user.lid || user.jid || user.id || "";
                      }
                      if (typeof user === "string" && user.includes("@lid")) {
                        const resolved = user.resolveLidToRealJid(
                          user,
                          self.conn,
                        );
                        return typeof resolved === "string" ? resolved : user;
                      }
                      return user;
                    })
                    .filter((jid) => jid && typeof jid === "string");
                },
                enumerable: true,
              },
              name: {
                get() {
                  const sender = this.sender;
                  return sender ? self.conn?.getName?.(sender) : null;
                },
                enumerable: true,
              },
              vM: {
                get() {
                  return proto.WebMessageInfo.create({
                    key: {
                      fromMe: this.fromMe,
                      remoteJid: this.chat,
                      id: this.id,
                    },
                    message: quoted,
                    ...(self.isGroup ? { participant: this.sender } : {}),
                  });
                },
                enumerable: true,
              },
              fakeObj: {
                get() {
                  return this.vM;
                },
                enumerable: true,
              },
              download: {
                value(guardarEnArchivo = false) {
                  const tipoMsg = this.mediaType;
                  return self.conn?.downloadM?.(
                    this.mediaMessage?.[tipoMsg],
                    tipoMsg?.replace(/message/i, ""),
                    guardarEnArchivo,
                  );
                },
                enumerable: true,
                configurable: true,
              },
              reply: {
                value(text, chatId, options) {
                  return self.conn?.reply?.(
                    chatId ? chatId : this.chat,
                    text,
                    this.vM,
                    options,
                  );
                },
                enumerable: true,
              },
              copy: {
                value() {
                  const M = proto.WebMessageInfo;
                  return smsg(self.conn, M.create(M.toObject(this.vM)));
                },
                enumerable: true,
              },
              forward: {
                value(jid, force = false, options) {
                  return self.conn?.sendMessage?.(
                    jid,
                    {
                      forward: this.vM,
                      force,
                      ...options,
                    },
                    { ...options },
                  );
                },
                enumerable: true,
              },
              copyNForward: {
                value(jid, forzarReenvio = false, options) {
                  return self.conn?.copyNForward?.(
                    jid,
                    this.vM,
                    forzarReenvio,
                    options,
                  );
                },
                enumerable: true,
              },
              cMod: {
                value(jid, text = "", sender = this.sender, options = {}) {
                  return self.conn?.cMod?.(jid, this.vM, text, sender, options);
                },
                enumerable: true,
              },
              delete: {
                value() {
                  return self.conn?.sendMessage?.(this.chat, {
                    delete: this.vM.key,
                  });
                },
                enumerable: true,
              },
            },
          );
        } catch (e) {
          console.error("Error en quoted getter:", e);
          return null;
        }
      },
      enumerable: true,
    },
    _text: {
      value: null,
      writable: true,
      enumerable: true,
    },
    text: {
      get() {
        try {
          if (typeof this._text === "string" && this._text) return this._text;

          const tipoMsg = this.mtype;
          const msg = this.msg;

          if (tipoMsg === "listResponseMessage") {
            const idFila = msg?.singleSelectReply?.selectedRowId;
            if (idFila) return idFila;
          }
          if (tipoMsg === "buttonsResponseMessage") {
            const idBoton = msg?.selectedButtonId;
            if (idBoton) return idBoton;
          }
          if (tipoMsg === "templateButtonReplyMessage") {
            const idPlantilla = msg?.selectedId;
            if (idPlantilla) return idPlantilla;
          }
          if (tipoMsg === "interactiveResponseMessage") {
            const paramsJson = msg?.nativeFlowResponseMessage?.paramsJson;
            if (paramsJson) {
              try {
                const parsed = JSON.parse(paramsJson);
                if (parsed?.id) return String(parsed.id);
              } catch {}
            }
          }

          const text =
            (typeof msg === "string" ? msg : msg?.text) ||
            msg?.caption ||
            msg?.contentText ||
            "";
          return (
            (typeof text === "string"
              ? text
              : text?.selectedDisplayText ||
                text?.hydratedTemplate?.hydratedContentText ||
                text) || ""
          );
        } catch (e) {
          console.error("Error en text getter:", e);
          return "";
        }
      },
      set(str) {
        this._text = str;
      },
      enumerable: true,
    },
    mentionedJid: {
      get() {
        try {
          const mentioned = this.msg?.contextInfo?.mentionedJid || [];
          return mentioned
            .map((user) => {
              if (user && typeof user === "object") {
                user = user.lid || user.jid || user.id || "";
              }
              if (typeof user === "string" && user.includes("@lid")) {
                const resolved = user.resolveLidToRealJid(user, this.conn);
                return typeof resolved === "string" ? resolved : user;
              }
              return user;
            })
            .filter((jid) => jid && typeof jid === "string");
        } catch (e) {
          console.error("Error en mentionedJid getter:", e);
          return [];
        }
      },
      enumerable: true,
    },
    name: {
      get() {
        try {
          if (!esNulo(this.pushName) && this.pushName) return this.pushName;
          const sender = this.sender;
          return sender ? this.conn?.getName?.(sender) : "";
        } catch (e) {
          console.error("Error en name getter:", e);
          return "";
        }
      },
      enumerable: true,
    },
    download: {
      value(guardarEnArchivo = false) {
        try {
          const tipoMsg = this.mediaType;
          return this.conn?.downloadM?.(
            this.mediaMessage?.[tipoMsg],
            tipoMsg?.replace(/message/i, ""),
            guardarEnArchivo,
          );
        } catch (e) {
          console.error("Error en download:", e);
          return Promise.reject(e);
        }
      },
      enumerable: true,
      configurable: true,
    },
    reply: {
      value(text, chatId, options) {
        try {
          return this.conn?.reply?.(
            chatId ? chatId : this.chat,
            text,
            this,
            options,
          );
        } catch (e) {
          console.error("Error en reply:", e);
          return Promise.reject(e);
        }
      },
      enumerable: true,
    },
    copy: {
      value() {
        try {
          const M = proto.WebMessageInfo;
          return smsg(this.conn, M.fromObject(M.toObject(this)));
        } catch (e) {
          console.error("Error en copy:", e);
          return null;
        }
      },
      enumerable: true,
    },
    forward: {
      value(jid, force = false, options = {}) {
        try {
          return this.conn?.sendMessage?.(
            jid,
            {
              forward: this,
              force,
              ...options,
            },
            { ...options },
          );
        } catch (e) {
          console.error("Error en forward:", e);
          return Promise.reject(e);
        }
      },
      enumerable: true,
    },
    copyNForward: {
      value(jid, forzarReenvio = false, options = {}) {
        try {
          return this.conn?.copyNForward?.(jid, this, forzarReenvio, options);
        } catch (e) {
          console.error("Error en copyNForward:", e);
          return Promise.reject(e);
        }
      },
      enumerable: true,
    },
    cMod: {
      value(jid, text = "", sender = this.sender, options = {}) {
        try {
          return this.conn?.cMod?.(jid, this, text, sender, options);
        } catch (e) {
          console.error("Error en cMod:", e);
          return Promise.reject(e);
        }
      },
      enumerable: true,
    },
    getQuotedObj: {
      value() {
        try {
          if (!this.quoted?.id) return null;
          const q = proto.WebMessageInfo.create(
            this.conn?.loadMessage?.(this.quoted.id) || this.quoted.vM || {},
          );
          return smsg(this.conn, q);
        } catch (e) {
          console.error("Error en getQuotedObj:", e);
          return null;
        }
      },
      enumerable: true,
    },
    getQuotedMessage: {
      get() {
        return this.getQuotedObj;
      },
      enumerable: true,
    },
    delete: {
      value() {
        try {
          return this.conn?.sendMessage?.(this.chat, { delete: this.key });
        } catch (e) {
          console.error("Error en delete:", e);
          return Promise.reject(e);
        }
      },
      enumerable: true,
    },
  });
}

export function logic(valor, entradas, salidas) {
  if (entradas.length !== salidas.length)
    throw new Error("Input and Output must have same length");
  for (const i in entradas)
    if (util.isDeepStrictEqual(valor, entradas[i])) return salidas[i];
  return null;
}

export function protoType() {
  Buffer.prototype.toArrayBuffer = function toArrayBufferV2() {
    const bufferArray = new ArrayBuffer(this.length);
    const vista = new Uint8Array(bufferArray);
    for (let i = 0; i < this.length; ++i) {
      vista[i] = this[i];
    }
    return bufferArray;
  };
  /**
   * @return {ArrayBuffer}
   */
  Buffer.prototype.toArrayBufferV2 = function toArrayBuffer() {
    return this.buffer.slice(
      this.byteOffset,
      this.byteOffset + this.byteLength,
    );
  };
  /**
   * @return {Buffer}
   */
  ArrayBuffer.prototype.toBuffer = function toBuffer() {
    return Buffer.from(new Uint8Array(this));
  };
  // /**
  //  * @returns {String}
  //  */
  // Buffer.prototype.toUtilFormat = ArrayBuffer.prototype.toUtilFormat = Object.prototype.toUtilFormat = Array.prototype.toUtilFormat = function toUtilFormat() {
  //     return util.format(this)
  // }
  Uint8Array.prototype.getFileType =
    ArrayBuffer.prototype.getFileType =
    Buffer.prototype.getFileType =
      async function getFileType() {
        return await fileTypeFromBuffer(this);
      };
  /**
   * @returns {Boolean}
   */
  String.prototype.isNumber = Number.prototype.isNumber = esNumero;
  /**
   *
   * @return {String}
   */
  String.prototype.capitalize = function capitalize() {
    return this.charAt(0).toUpperCase() + this.slice(1, this.length);
  };
  /**
   * @return {String}
   */
  String.prototype.capitalizeV2 = function capitalizeV2() {
    const partes = this.split(" ");
    return partes.map((v) => v.capitalize()).join(" ");
  };

  
  String.prototype.resolveLidToRealJid = (function () {
    const cacheLid = new Map();
    return async function (
      groupChatId,
      conn,
      maxReintentos = 3,
      retardoReintento = 60000,
    ) {
      const jidEntrada = this.toString();
      if (!jidEntrada.endsWith("@lid") || !groupChatId?.endsWith("@g.us")) {
        return jidEntrada.includes("@") ? jidEntrada : `${jidEntrada}@s.whatsapp.net`;
      }
      if (cacheLid.has(jidEntrada)) {
        return cacheLid.get(jidEntrada);
      }
      const lidBuscado = jidEntrada.split("@")[0].split(":")[0];

      // 1) Baileys oficial: lidMapping.getPNForLID
      try {
        const pn = await conn?.signalRepository?.lidMapping?.getPNForLID?.(jidEntrada);
        if (pn && String(pn).includes("@s.whatsapp.net")) {
          const clean = conn.decodeJid?.(pn) || pn;
          cacheLid.set(jidEntrada, clean);
          return clean;
        }
      } catch {}

      let intentosLid = 0;
      while (intentosLid < maxReintentos) {
        try {
          const metadata = await conn?.groupMetadata(groupChatId);
          if (!metadata?.participants)
            throw new Error("No se obtuvieron participantes");
          for (const participant of metadata.participants) {
            try {
              const pid = conn?.decodeJid?.(participant.id) || participant.id;
              const pLid = participant.lid
                ? (String(participant.lid).includes("@") ? participant.lid : `${participant.lid}@lid`)
                : "";
              const pPhone = participant.phoneNumber
                ? (String(participant.phoneNumber).includes("@")
                  ? participant.phoneNumber
                  : `${String(participant.phoneNumber).replace(/\D/g, "")}@s.whatsapp.net`)
                : "";

              const lidMatch =
                (pid && pid.split("@")[0].split(":")[0] === lidBuscado) ||
                (pLid && pLid.split("@")[0].split(":")[0] === lidBuscado);

              if (lidMatch && pPhone) {
                const clean = conn.decodeJid?.(pPhone) || pPhone;
                try {
                  await conn?.signalRepository?.lidMapping?.storeLIDPNMappings?.([
                    { lid: jidEntrada, pn: clean },
                  ]);
                } catch {}
                cacheLid.set(jidEntrada, clean);
                return clean;
              }

              if (!participant?.jid) continue;
              const detallesContacto = await conn?.onWhatsApp(participant.jid);
              if (!detallesContacto?.[0]?.lid) continue;
              const lidPosible = detallesContacto[0].lid.split("@")[0];
              if (lidPosible === lidBuscado) {
                cacheLid.set(jidEntrada, participant.jid);
                return participant.jid;
              }
            } catch (e) {
              continue;
            }
          }
          cacheLid.set(jidEntrada, jidEntrada);
          return jidEntrada;
        } catch (e) {
          if (++intentosLid >= maxReintentos) {
            cacheLid.set(jidEntrada, jidEntrada);
            return jidEntrada;
          }
          await new Promise((resolve) => setTimeout(resolve, retardoReintento));
        }
      }
      return jidEntrada;
    };
  })();

  String.prototype.decodeJid = function decodeJid() {
    if (/:\d+@/gi.test(this)) {
      const decodificado = jidDecode(this) || {};
      return (
        (decodificado.user && decodificado.server && decodificado.user + "@" + decodificado.server) ||
        this
      ).trim();
    } else return this.trim();
  };
  /**
   * El número debe estar en milisegundos
   * @return {string}
   */
  Number.prototype.toTimeString = function toTimeString() {
  
    const segundos = Math.floor((this / 1000) % 60);
    const minutos = Math.floor((this / (60 * 1000)) % 60);
    const horas = Math.floor((this / (60 * 60 * 1000)) % 24);
    const dias = Math.floor(this / (24 * 60 * 60 * 1000));
    return (
      (dias ? `${dias} day(s) ` : "") +
      (horas ? `${horas} hour(s) ` : "") +
      (minutos ? `${minutos} minute(s) ` : "") +
      (segundos ? `${segundos} second(s)` : "")
    ).trim();
  };
  Number.prototype.getRandom =
    String.prototype.getRandom =
    Array.prototype.getRandom =
      obtenerAleatorio;
}

function esNumero() {
  const int = parseInt(this);
  return typeof int === "number" && !isNaN(int);
}

function obtenerAleatorio() {
  if (Array.isArray(this) || this instanceof String)
    return this[Math.floor(Math.random() * this.length)];
  return Math.floor(Math.random() * this);
}

/**
 * - (null || undefined) ?? 'idk'
 * @link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_operator
 */
function esNulo(args) {
  return !(args !== null && args !== undefined);
}
