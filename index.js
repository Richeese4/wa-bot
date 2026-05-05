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
// KEEP ALIVE (ANTI SLEEP)
// =========================
const app = express()
app.get("/", (req, res) => res.send("Bot aktif 🚀"))
app.listen(3000, () => console.log("🌐 Web aktif di port 3000"))

// =========================
// START BOT
// =========================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("session")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state,
    browser: ["Windows", "Chrome", "120.0.0"]
  })

  sock.ev.on("creds.update", saveCreds)

  // =========================
  // 🔥 ANTI DISCONNECT PRO
  // =========================
  let retryCount = 0

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log("📱 Scan QR:")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "connecting") {
      console.log("🔄 Menghubungkan...")
    }

    if (connection === "open") {
      console.log("✅ BOT AKTIF")
      retryCount = 0
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = reason !== DisconnectReason.loggedOut

      console.log("❌ Koneksi putus. Reason:", reason)

      if (shouldReconnect) {
        retryCount++

        let delay = 3000 * retryCount
        if (delay > 15000) delay = 15000

        console.log(`🔁 Reconnect ke-${retryCount} dalam ${delay / 1000} detik`)

        setTimeout(() => {
          startBot()
        }, delay)
      } else {
        console.log("🚫 Session logout! Scan ulang QR")
      }
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
  // WELCOME MEMBER (FIX)
  // =========================
  sock.ev.on("group-participants.update", async (anu) => {
    try {
      if (anu.action === "add") {
        for (let user of anu.participants) {
          if (fs.existsSync(__dirname + "/welcome.jpg")) {
            await sock.sendMessage(anu.id, {
              image: fs.readFileSync(__dirname + "/welcome.jpg"),
              caption: `👋 Selamat datang @${user.split("@")[0]} di group!\nSemoga betah ya ✨`,
              mentions: [user]
            })
          }
        }
      }
    } catch (err) {
      console.log("WELCOME ERROR:", err)
    }
  })

  // =========================
  // MESSAGE HANDLER
  // =========================
  sock.ev.on("messages.upsert", async (m) => {
    try {
      const msg = m.messages[0]
      if (!msg.message) return

      const from = msg.key.remoteJid
      const isGroup = from.endsWith("@g.us")
      const sender = msg.key.participant || from

      // auto read
      await sock.readMessages([msg.key])

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""

      // =========================
      // QRIS
      // =========================
      if (text.toLowerCase() === ".qris") {
        if (fs.existsSync(__dirname + "/qris.jpg")) {
          await sock.sendMessage(from, {
            image: fs.readFileSync(__dirname + "/qris.jpg"),
            caption: "💸 Scan QRIS untuk pembayaran"
          })
        }
        return
      }

      if (!isGroup) return

      // =========================
      // CEK ADMIN
      // =========================
      let isAdmin = false
      try {
        const meta = await sock.groupMetadata(from)
        isAdmin = meta.participants.some(
          (p) => p.id === sender && p.admin !== null
        )
      } catch {}

      if (isAdmin) return

      // =========================
      // 🚫 LINK UNDANGAN WHATSAPP SAJA
      // =========================
      const isInvite =
        /chat\.whatsapp\.com/i.test(text) ||
        /whatsapp\.com\/invite/i.test(text)

      if (isInvite) {
        await sock.sendMessage(from, { delete: msg.key })
        return
      }

      // =========================
      // 🚫 STATUS TAG GROUP SAJA
      // =========================
      const isStatusGroupTag =
        msg.message?.protocolMessage?.type === 25

      if (isStatusGroupTag) {
        await sock.sendMessage(from, { delete: msg.key })
        return
      }

    } catch (err) {
      console.log("ERROR:", err)
    }
  })
}

// =========================
// ANTI CRASH GLOBAL
// =========================
process.on("uncaughtException", (err) => {
  console.log("❌ ERROR:", err)
})

process.on("unhandledRejection", (err) => {
  console.log("❌ PROMISE ERROR:", err)
})

// =========================
// KEEP ALIVE LOG
// =========================
setInterval(() => {
  console.log("🟢 Bot masih hidup:", new Date().toLocaleTimeString())
}, 60000)

// =========================
// RUN
// =========================
startBot()
