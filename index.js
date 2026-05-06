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
    keepAliveIntervalMs: 30000
  })

  sock.ev.on("creds.update", saveCreds)

  // =========================
  // SESSION MENU
  // =========================
  const menuSession = {}

  // =========================
  // CONNECTION (ANTI TIMEOUT)
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
      const reason = lastDisconnect?.error?.output?.statusCode

      console.log("❌ Disconnect:", reason)

      // reconnect semua kecuali logout
      if (reason !== DisconnectReason.loggedOut) {
        setTimeout(() => startBot(), 5000)
      } else {
        console.log("⚠️ Scan ulang QR!")
      }
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
      const sender = msg.key.participant || from

      const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ""
      ).trim().toLowerCase()

      await sock.readMessages([msg.key])

      // =========================
      // QRIS (GLOBAL - SELALU BISA)
      // =========================
      if (text === ".qris") {
        if (fs.existsSync("./qris.jpg")) {
          await sock.sendMessage(from, {
            image: fs.readFileSync("./qris.jpg"),
            caption: "💸 Scan QRIS"
          })
        }
        return
      }

      // =========================
      // MENU
      // =========================
      if (text === ".menu") {
        const username = sender.split("@")[0]

        // reset session lama
        if (menuSession[sender]?.timeout) {
          clearTimeout(menuSession[sender].timeout)
        }

        // buat session baru (30 detik)
        const timeout = setTimeout(() => {
          delete menuSession[sender]
        }, 30000)

        menuSession[sender] = { timeout }

        await sock.sendMessage(from, {
          text: `👋 Hallo Kak @${username}

Ada yang bisa aku bantu😊?

📌 *PILIH MENU*
.1 Jasa Joki
.2 Rekber / Midman
.3 Payment

⏳ Berlaku 30 detik`,
          mentions: [sender]
        })
        return
      }

      // =========================
      // HANYA PROSES COMMAND TITIK
      // =========================
      if (!text.startsWith(".")) return

      // =========================
      // CEK SESSION
      // =========================
      if (!menuSession[sender]) return

      // =========================
      // MENU 1
      // =========================
      if (text === ".1") {
        clearTimeout(menuSession[sender].timeout)
        delete menuSession[sender]

        await sock.sendMessage(from, {
          text: `📌 *LIST JOKI BY ZNOIDFAMZ*

Joki Level
-100 level = 2k (sea 3) 
-100 level = 3k (sea 2) 
-100 level = 4k (sea 1) 
-500 level =10k (sea 3) 
-1k level =18k (sea 3)

📩 Minat? Chat Worker Kami!`
        })
        return
      }

      // =========================
      // MENU 2
      // =========================
      if (text === ".2") {
        clearTimeout(menuSession[sender].timeout)
        delete menuSession[sender]

        await sock.sendMessage(from, {
          text: `📌 *LIST FEE REKBER*

1.000 - 20.000 = 2.000
21.000 - 99.000 = 3.000
100.000 - 299.000 = 5.000

📩 Ketik *.qris* untuk bayar`
        })
        return
      }

      // =========================
      // MENU 3
      // =========================
      if (text === ".3") {
        clearTimeout(menuSession[sender].timeout)
        delete menuSession[sender]

        await sock.sendMessage(from, {
          text: `💳 *PAYMENT*

1. QRIS (.qris)
2. DANA
3. GOPAY
4. BCA`
        })
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
// RUN
// =========================
startBot()
