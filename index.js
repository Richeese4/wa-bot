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
// OWNER CONFIG (NAME LOGIN)
// =========================
const OWNER_NAME = "Pedro"
const OWNER_KEY = "freewilly123"

// =========================
// DATABASE
// =========================
const users = {}
const keys = {}

// contoh menu per user
const userMenus = {}

// =========================
// EXPRESS
// =========================
const app = express()
app.get("/", (req, res) => res.send("Bot aktif 🚀"))
app.listen(3000)

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

  const getNum = (jid) => jid.split("@")[0]

  const isLoggedIn = (id) => users[id]?.loggedIn

  // =========================
  // CONNECTION
  // =========================
  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update

    if (qr) qrcode.generate(qr, { small: true })

    if (connection === "open") {
      console.log("BOT READY")
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode
      if (code !== DisconnectReason.loggedOut) {
        setTimeout(() => startBot(), 5000)
      }
    }
  })

  // =========================
  // LOGIN SYSTEM
  // =========================
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0]
    if (!msg.message) return

    const from = msg.key.remoteJid
    const sender = msg.key.participant || from
    const jid = getNum(sender)

    const text = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim().toLowerCase()

    // =========================
    // OWNER LOGIN (NAME + KEY)
    // =========================
    if (text.startsWith(".login")) {
      const [, name, key] = text.split(" ")

      if (name === OWNER_NAME && key === OWNER_KEY) {
        users[jid] = {
          loggedIn: true,
          role: "owner"
        }

        // menu khusus owner
        userMenus[jid] = [
          ".genkey",
          ".listuser",
          ".menu owner panel"
        ]

        return sock.sendMessage(from, {
          text: "👑 OWNER LOGIN BERHASIL"
        })
      }

      // =========================
      // USER LOGIN (NUMBER + KEY)
      // =========================
      if (!keys[key]) {
        return sock.sendMessage(from, {
          text: "❌ Key salah"
        })
      }

      if (keys[key].used) {
        return sock.sendMessage(from, {
          text: "❌ Key sudah dipakai"
        })
      }

      users[jid] = {
        loggedIn: true,
        role: "user",
        key
      }

      keys[key].used = true

      // menu user random / bisa kamu custom per user
      userMenus[jid] = [
        ".1 joki",
        ".2 rekber",
        ".3 payment"
      ]

      return sock.sendMessage(from, {
        text: "✅ LOGIN BERHASIL"
      })
    }

    // =========================
    // BLOCK IF NOT LOGIN
    // =========================
    if (!isLoggedIn(jid)) {
      if (text === ".menu") {
        return sock.sendMessage(from, {
          text: "❌ Harus login dulu\nGunakan .login <number/key> atau .login Pedro freewilly123"
        })
      }
      return
    }

    // =========================
    // MENU PERSONAL USER
    // =========================
    if (text === ".menu") {
      const menu = userMenus[jid] || ["menu kosong"]

      return sock.sendMessage(from, {
        text:
`📌 MENU ANDA:

${menu.join("\n")}`
      })
    }

    // =========================
    // OWNER GENERATE KEY
    // =========================
    if (text.startsWith(".genkey")) {
      if (users[jid]?.role !== "owner") {
        return sock.sendMessage(from, {
          text: "❌ hanya owner bisa generate key"
        })
      }

      const key = Math.random().toString(36).substring(2, 10)

      keys[key] = {
        used: false,
        expired: Date.now() + 24 * 60 * 60 * 1000
      }

      return sock.sendMessage(from, {
        text: `🔑 KEY: ${key}`
      })
    }

    // =========================
    // EXPIRED CLEANER
    // =========================
    for (let k in keys) {
      if (keys[k].expired && Date.now() > keys[k].expired) {
        delete keys[k]
      }
    }
  })
}

startBot()
