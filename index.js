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
// OWNER CONFIG
// =========================
const OWNER_KEY = "freewilly123"

// =========================
// DATABASE
// =========================
const users = {}
const keys = {}

// menu per user (berdasarkan nomor)
const userMenus = {}

// =========================
// EXPRESS KEEP ALIVE
// =========================
const app = express()
app.get("/", (req, res) => res.send("Bot aktif 🚀"))
app.listen(3000, () => console.log("🌐 Web aktif"))

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

  const getNum = (jid) => jid.split("@")[0]

  // =========================
  // CONNECTION
  // =========================
  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update

    if (qr) {
      console.log("SCAN QR:")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "open") {
      console.log("BOT READY")
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode
      if (code !== DisconnectReason.loggedOut) startBot()
    }
  })

  // =========================
  // MESSAGE HANDLER
  // =========================
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0]
    if (!msg.message) return

    const from = msg.key.remoteJid
    const sender = msg.key.participant || from
    const jid = getNum(sender)

    const text =
      (msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "").trim().toLowerCase()

    // =========================
    // LOGIN SYSTEM
    // =========================
    if (text.startsWith(".login")) {
      const parts = text.split(" ").filter(Boolean)
      const input = parts[1]

      // =========================
      // OWNER LOGIN (NO NUMBER)
      // =========================
      if (input === OWNER_KEY) {
        users[jid] = {
          loggedIn: true,
          role: "owner"
        }

        userMenus[jid] = [
          ".genkey",
          ".listkey",
          ".panel"
        ]

        return sock.sendMessage(from, {
          text: "👑 OWNER LOGIN BERHASIL"
        })
      }

      // =========================
      // USER LOGIN (KEY ONLY)
      // =========================
      if (!input || !keys[input]) {
        return sock.sendMessage(from, {
          text: "❌ Key tidak valid"
        })
      }

      if (keys[input].used) {
        return sock.sendMessage(from, {
          text: "❌ Key sudah dipakai"
        })
      }

      users[jid] = {
        loggedIn: true,
        role: "user",
        key: input
      }

      keys[input].used = true

      if (!userMenus[jid]) {
        userMenus[jid] = [
          ".1 joki",
          ".2 rekber",
          ".3 payment"
        ]
      }

      return sock.sendMessage(from, {
        text: "✅ LOGIN BERHASIL"
      })
    }

    // =========================
    // BLOCK BEFORE LOGIN
    // =========================
    if (!users[jid]?.loggedIn) {
      if (text === ".menu") {
        return sock.sendMessage(from, {
          text: "❌ Kamu harus login dulu\nGunakan .login <key>"
        })
      }
      return
    }

    // =========================
    // MENU SYSTEM
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
    // GENERATE KEY (OWNER ONLY)
    // =========================
    if (text === ".genkey") {
      if (users[jid]?.role !== "owner") {
        return sock.sendMessage(from, {
          text: "❌ hanya owner"
        })
      }

      const key = Math.random().toString(36).substring(2, 10)

      keys[key] = {
        used: false,
        expired: Date.now() + 24 * 60 * 60 * 1000
      }

      return sock.sendMessage(from, {
        text: `🔑 KEY GENERATED: ${key}`
      })
    }

    // =========================
    // AUTO DELETE EXPIRED KEY
    // =========================
    for (let k in keys) {
      if (keys[k].expired && Date.now() > keys[k].expired) {
        delete keys[k]
      }
    }
  })
}

startBot()
