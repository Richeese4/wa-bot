const P = require("pino")
const qrcode = require("qrcode-terminal")
const fs = require("fs")
const express = require("express")

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys")

// =========================
// KEEP ALIVE
// =========================
const app = express()
app.get("/", (req, res) => res.send("Bot aktif 🚀"))
app.listen(3000)

// =========================
// CACHE ADMIN (ANTI DELAY)
// =========================
const groupCache = {}

// =========================
// START BOT
// =========================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("session")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state
  })

  sock.ev.on("creds.update", saveCreds)

  // =========================
  // CONNECTION
  // =========================
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log("📱 Scan QR:")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "open") {
      console.log("✅ BOT AKTIF")
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

      if (shouldReconnect) startBot()
    }
  })

  // =========================
  // AUTO TOLAK TELEPON
  // =========================
  sock.ev.on("call", async (calls) => {
    for (let call of calls) {
      if (call.status === "offer") {
        await sock.rejectCall(call.id, call.from)
      }
    }
  })

  // =========================
  // UPDATE CACHE SAAT GROUP BERUBAH
  // =========================
  sock.ev.on("group-participants.update", async (anu) => {
    delete groupCache[anu.id]

    try {
      if (anu.action === "add") {
        for (let user of anu.participants) {
          if (fs.existsSync("./welcome.jpg")) {
            await sock.sendMessage(anu.id, {
              image: fs.readFileSync("./welcome.jpg"),
              caption: `👋 Selamat datang @${user.split("@")[0]}`,
              mentions: [user]
            })
          }
        }
      }
    } catch {}
  })

  // =========================
  // MESSAGE HANDLER (ULTRA FAST)
  // =========================
  sock.ev.on("messages.upsert", async (m) => {
    try {
      const msg = m.messages[0]
      if (!msg.message) return

      const from = msg.key.remoteJid
      if (!from.endsWith("@g.us")) return

      // ⚡ AUTO READ TANPA NUNGGU
      sock.readMessages([msg.key])

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""

      // =========================
      // QRIS
      // =========================
      if (text.toLowerCase() === ".qris") {
        if (fs.existsSync("./qris.jpg")) {
          await sock.sendMessage(from, {
            image: fs.readFileSync("./qris.jpg"),
            caption: "💸 Scan QRIS"
          })
        }
        return
      }

      const sender = msg.key.participant

      // =========================
      // CEK ADMIN (CACHE)
      // =========================
      let isAdmin = false

      try {
        if (!groupCache[from]) {
          const meta = await sock.groupMetadata(from)
          groupCache[from] = meta.participants
        }

        const admins = groupCache[from]
          .filter(p => p.admin !== null)
          .map(p => p.id)

        isAdmin = admins.includes(sender)
      } catch {}

      if (isAdmin) return

      // =========================
      // 🚫 LINK INVITE WA (FAST)
      // =========================
      if (/chat\.whatsapp\.com/i.test(text)) {
        sock.sendMessage(from, { delete: msg.key })
        return
      }

      // =========================
      // 🚫 STATUS TAG GROUP
      // =========================
      if (msg.message?.protocolMessage?.type === 25) {
        sock.sendMessage(from, { delete: msg.key })
        return
      }

    } catch {}
  })
}

// =========================
// ANTI CRASH
// =========================
process.on("uncaughtException", () => {})
process.on("unhandledRejection", () => {})

// =========================
// RUN
// =========================
startBot()
