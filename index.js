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
// CONFIG OWNER
// =========================
const OWNER_NUMBER = "6282162625200"
const OWNER_KEY = "freewilly123"

// =========================
// DATABASE
// =========================
const users = {}
const keys = {}

// =========================
// EXPRESS
// =========================
const app = express()
app.get("/", (req, res) => res.send("Bot aktif 🚀"))
app.listen(3000, () => console.log("WEB ON"))

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
    const { connection, qr, lastDisconnect } = update

    if (qr) qrcode.generate(qr, { small: true })

    if (connection === "open") {
      console.log("BOT READY")
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

      if (shouldReconnect) startBot()
    }
  })

  // =========================
  // HELPERS FIX OWNER DETECT
  // =========================
  const getNumber = (jid) => jid.split("@")[0]

  const isOwner = (sender) => getNumber(sender) === OWNER_NUMBER

  const isLoggedIn = (sender) => users[sender]?.loggedIn

  // =========================
  // MESSAGE
  // =========================
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0]
    if (!msg.message) return

    const from = msg.key.remoteJid
    const sender = msg.key.participant || from

    const text = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim().toLowerCase()

    // =========================
    // LOGIN SYSTEM
    // =========================
    if (text.startsWith(".login")) {
      const key = text.split(" ")[1]

      // ================= OWNER LOGIN =================
      if (isOwner(sender) && key === OWNER_KEY) {
        users[sender] = {
          loggedIn: true,
          role: "owner"
        }

        return sock.sendMessage(from, {
          text: "✅ OWNER LOGIN BERHASIL"
        })
      }

      // ================= USER LOGIN =================
      if (!keys[key]) {
        return sock.sendMessage(from, {
          text: "❌ Key tidak valid"
        })
      }

      if (keys[key].used) {
        return sock.sendMessage(from, {
          text: "❌ Key sudah dipakai"
        })
      }

      users[sender] = {
        loggedIn: true,
        role: "user",
        key
      }

      keys[key].used = true

      return sock.sendMessage(from, {
        text: "✅ Login berhasil (24 jam)"
      })
    }

    // =========================
    // BLOCK IF NOT LOGIN
    // =========================
    if (!isLoggedIn(sender)) {
      if (text === ".menu") {
        return sock.sendMessage(from, {
          text: "❌ Kamu belum login\nGunakan .login <key>"
        })
      }
      return
    }

    // =========================
    // OWNER MENU
    // =========================
    if (text === ".menu" && isOwner(sender)) {
      return sock.sendMessage(from, {
        text:
`👑 OWNER MENU

.genkey <jam>
.listkey`
      })
    }

    // =========================
    // USER MENU
    // =========================
    if (text === ".menu") {
      return sock.sendMessage(from, {
        text:
`📌 USER MENU

.1 Joki
.2 Rekber
.3 Payment`
      })
    }

    // =========================
    // GENERATE KEY (OWNER ONLY FIXED)
    // =========================
    if (text.startsWith(".genkey")) {
      if (!isOwner(sender)) {
        return sock.sendMessage(from, {
          text: "❌ Hanya owner bisa generate key"
        })
      }

      const hours = parseInt(text.split(" ")[1]) || 24
      const key = Math.random().toString(36).substring(2, 10)

      keys[key] = {
        used: false,
        expired: Date.now() + hours * 3600000
      }

      return sock.sendMessage(from, {
        text:
`🔑 KEY GENERATED

KEY: ${key}
DURASI: ${hours} JAM`
      })
    }

    // =========================
    // AUTO EXPIRED CLEANER
    // =========================
    for (let k in keys) {
      if (keys[k].expired && Date.now() > keys[k].expired) {
        delete keys[k]
      }
    }
  })
}

startBot()
