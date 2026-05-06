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

const app = express()
app.get("/", (req, res) => res.send("Bot aktif 🚀"))
app.listen(3000, () => console.log("WEB ON"))

const OWNER = "6282162625200"

// =========================
// DATABASE SIMPLE (JSON MEMORY)
// =========================
let users = {} 
let keys = {}  // { key: {used:false, exp, ownerMenu} }

// =========================
// GENERATE KEY
// =========================
function generateKey() {
  return "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase()
}

// =========================
// MENU PER USER
// =========================
function getMenu(user) {
  if (user === "6281111111111") {
    return `📌 MENU A:
.1 Joki
.2 Rekber`
  }

  if (user === "6282222222222") {
    return `📌 MENU B:
.1 Mabar
.2 Live`
  }

  return `📌 MENU DEFAULT:
.1 Info
.2 Support`
}

// =========================
// BOT START
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

    if (qr) qrcode.generate(qr, { small: true })

    if (connection === "open") console.log("BOT READY")

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(() => startBot(), 5000)
      }
    }
  })

  // =========================
  // MESSAGE
  // =========================
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0]
    if (!msg.message) return

    const from = msg.key.remoteJid
    const sender = (msg.key.participant || from).split("@")[0]

    const text = (
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ""
    ).trim().toLowerCase()

    // =========================
    // GENERATE KEY (OWNER ONLY)
    // =========================
    if (text.startsWith(".genkey")) {
      if (sender !== OWNER) {
        return sock.sendMessage(from, { text: "❌ Anda bukan owner / tidak punya akses" })
      }

      const args = text.split(" ")
      const duration = args[1] || "24h"

      const key = generateKey()

      const exp = Date.now() + 24 * 60 * 60 * 1000

      keys[key] = {
        used: false,
        exp,
        menu: "default"
      }

      return sock.sendMessage(from, {
        text: `🔑 KEY GENERATED

KEY: ${key}
EXPIRED: 24 JAM
METHOD: .login ${key}

⚠️ 1x pakai`
      })
    }

    // =========================
    // LOGIN SYSTEM
    // =========================
    if (text.startsWith(".login")) {
      const key = text.split(" ")[1]

      if (!keys[key]) {
        return sock.sendMessage(from, { text: "❌ Key tidak valid" })
      }

      if (keys[key].used) {
        return sock.sendMessage(from, { text: "❌ Key sudah dipakai" })
      }

      keys[key].used = true

      users[sender] = {
        logged: true,
        exp: keys[key].exp,
        menuType: keys[key].menu
      }

      return sock.sendMessage(from, {
        text: `✅ LOGIN BERHASIL
Selamat datang ${sender}`
      })
    }

    // =========================
    // CHECK LOGIN
    // =========================
    const user = users[sender]

    if (!user || !user.logged) {
      if (text === ".menu") {
        return sock.sendMessage(from, {
          text: "❌ Kamu belum login\nGunakan .login <key>\nHubungi owner untuk beli key"
        })
      }
      return
    }

    // =========================
    // EXPIRED CHECK
    // =========================
    if (Date.now() > user.exp) {
      delete users[sender]

      return sock.sendMessage(from, {
        text: "⏳ Login kamu sudah expired\nHubungi owner untuk perpanjangan"
      })
    }

    // =========================
    // MENU USER
    // =========================
    if (text === ".menu") {
      return sock.sendMessage(from, {
        text: getMenu(sender)
      })
    }
  })
}

startBot()
