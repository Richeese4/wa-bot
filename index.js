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
// CONFIG
// =========================
const OWNER = "6282162625200"

// =========================
// HELPERS
// =========================
function clean(jid) {
  return jid.split("@")[0]
}

function now() {
  return Date.now()
}

function generateKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let key = ""
  for (let i = 0; i < 10; i++) {
    key += chars[Math.floor(Math.random() * chars.length)]
  }
  return key
}

// =========================
// DATABASE
// =========================
let db = {
  users: {},
  keys: {},
  reseller: {}
}

if (fs.existsSync("./db.json")) {
  db = JSON.parse(fs.readFileSync("./db.json"))
}

function saveDB() {
  fs.writeFileSync("./db.json", JSON.stringify(db, null, 2))
}

// =========================
// EXPRESS KEEP ALIVE
// =========================
const app = express()
app.get("/", (req, res) => res.send("BOT AKTIF 🚀"))
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

  // =========================
  // CONNECTION
  // =========================
  sock.ev.on("connection.update", (u) => {
    const { connection, qr, lastDisconnect } = u

    if (qr) qrcode.generate(qr, { small: true })
    if (connection === "open") console.log("BOT READY")

    if (connection === "close") {
      const reconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

      if (reconnect) startBot()
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
      const user = clean(sender)

      const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ""
      ).trim().toLowerCase()

      await sock.readMessages([msg.key])

      // =========================
      // ROLE CHECK
      // =========================
      const isOwner = user === OWNER
      const isReseller = db.reseller[user]
      const isUser = db.users[user]
      const isActive = isUser && isUser.expire > now()

      // =========================
      // BLOCK IF NOT LOGIN
      // =========================
      if (!isOwner && !isReseller && !isActive) {
        if (text.startsWith(".")) {
          return sock.sendMessage(from, {
            text: `🔒 HARUS LOGIN

.login nomor key

Hubungi Owner:
${OWNER}`
          })
        }
      }

      // =========================
      // GENERATE KEY (OWNER/RESELLER ONLY)
      // =========================
      if (text.startsWith(".genkey")) {
        if (!isOwner && !isReseller) {
          return sock.sendMessage(from, { text: "❌ No access" })
        }

        const dur = parseInt(text.split(" ")[1]) || 24
        const key = generateKey()

        db.keys[key] = {
          used: false,
          duration: dur * 3600000
        }

        saveDB()

        return sock.sendMessage(from, {
          text: `🔑 KEY GENERATED

KEY: ${key}
DURASI: ${dur} JAM`
        })
      }

      // =========================
      // LOGIN SYSTEM
      // =========================
      if (text.startsWith(".login")) {
        const [, nomor, key] = text.split(" ")

        if (!db.keys[key]) {
          return sock.sendMessage(from, { text: "❌ Key invalid" })
        }

        if (db.keys[key].used) {
          return sock.sendMessage(from, { text: "❌ Key sudah dipakai" })
        }

        db.users[nomor] = {
          expire: now() + db.keys[key].duration,
          menu: {
            ".menu": "📌 MENU USER " + nomor,
            ".1": "🔥 JOKI PRIVATE " + nomor,
            ".2": "💰 REKBER PRIVATE " + nomor,
            ".3": "💳 PAYMENT PRIVATE " + nomor
          }
        }

        db.keys[key].used = true
        saveDB()

        return sock.sendMessage(from, {
          text: "✅ LOGIN BERHASIL"
        })
      }

      // =========================
      // GET USER
      // =========================
      const userData = db.users[user]
      const active = userData && userData.expire > now()

      if (userData && userData.expire < now()) {
        delete db.users[user]
        saveDB()

        return sock.sendMessage(from, {
          text: "⛔ EXPIRED - HUBUNGI OWNER"
        })
      }

      // =========================
      // MENU SYSTEM PER USER
      // =========================
      if (text === ".menu" && active) {
        return sock.sendMessage(from, {
          text: userData.menu[".menu"]
        })
      }

      if (text === ".1" && active) {
        return sock.sendMessage(from, {
          text: userData.menu[".1"]
        })
      }

      if (text === ".2" && active) {
        return sock.sendMessage(from, {
          text: userData.menu[".2"]
        })
      }

      if (text === ".3" && active) {
        return sock.sendMessage(from, {
          text: userData.menu[".3"]
        })
      }

    } catch (e) {
      console.log(e)
    }
  })
}

startBot()
