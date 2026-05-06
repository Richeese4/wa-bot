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
// DATABASE SEDERHANA
// =========================
const users = {} // penyimpanan user login
const validKeys = {
  "abcd": { used: false },
  "znoid": { used: false }
}

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
      // LOGIN SYSTEM
      // =========================
      if (text.startsWith(".login")) {
        const key = text.split(" ")[1]

        if (!key) {
          return sock.sendMessage(from, { text: "❌ Masukkan key!\nContoh: .login abcd" })
        }

        if (!validKeys[key]) {
          return sock.sendMessage(from, { text: "❌ Key tidak valid!" })
        }

        if (validKeys[key].used) {
          return sock.sendMessage(from, { text: "❌ Key sudah dipakai!" })
        }

        // aktifkan user
        const expired = Date.now() + 86400000 // 24 jam

        users[sender] = {
          key,
          expired
        }

        validKeys[key].used = true

        await sock.sendMessage(from, {
          text: `✅ Login berhasil!

⏳ Berlaku 24 jam
Gunakan *.menu* sekarang`
        })
        return
      }

      // =========================
      // CEK LOGIN
      // =========================
      if (!users[sender]) {
        if (text.startsWith(".")) {
          return sock.sendMessage(from, {
            text: "🔒 Kamu belum login!\nGunakan *.login <key>*"
          })
        }
        return
      }

      // =========================
      // CEK EXPIRED
      // =========================
      if (Date.now() > users[sender].expired) {
        delete users[sender]

        return sock.sendMessage(from, {
          text: `⛔ Masa aktif habis!

Silakan perpanjang akses
Hubungi Owner: 08XXXXXXXXXX`
        })
      }

      // =========================
      // MENU
      // =========================
      if (text === ".menu") {
        const username = sender.split("@")[0]

        await sock.sendMessage(from, {
          text: `👋 Hallo Kak @${username}

📌 MENU
.1 Jasa Joki
.2 Rekber
.3 Payment`,
          mentions: [sender]
        })
        return
      }

      // =========================
      // MENU 1
      // =========================
      if (text === ".1") {
        await sock.sendMessage(from, {
          text: "📌 LIST JOKI BY ZNOIDFAMZ\n(isi sesuai list kamu)"
        })
        return
      }

      // =========================
      // MENU 2
      // =========================
      if (text === ".2") {
        await sock.sendMessage(from, {
          text: "📌 LIST REKBER\n(isi sesuai list kamu)"
        })
        return
      }

      // =========================
      // MENU 3
      // =========================
      if (text === ".3") {
        await sock.sendMessage(from, {
          text: "💳 PAYMENT\n(isi sesuai payment kamu)"
        })
        return
      }

    } catch (err) {
      console.log("ERROR:", err)
    }
  })
}

// =========================
// RUN
// =========================
startBot()
