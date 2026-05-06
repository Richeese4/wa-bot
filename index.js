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
function cleanJid(jid) {
  return jid.split("@")[0]
}

function now() {
  return Date.now()
}

// =========================
// DB
// =========================
let db = {
  users: {},
  keys: {},
  resellers: {}
}

if (fs.existsSync("./db.json")) {
  db = JSON.parse(fs.readFileSync("./db.json"))
}

function saveDB() {
  fs.writeFileSync("./db.json", JSON.stringify(db, null, 2))
}

// =========================
// KEY GENERATOR
// =========================
function generateKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let k = ""
  for (let i = 0; i < 10; i++) {
    k += chars[Math.floor(Math.random() * chars.length)]
  }
  return k
}

// =========================
// KEEP ALIVE
// =========================
const app = express()
app.get("/", (req, res) => res.send("BOT PREMIUM AKTIF 🚀"))
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
    if (connection === "open") console.log("BOT PREMIUM AKTIF")

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
      const user = cleanJid(sender)

      const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ""
      ).trim()

      await sock.readMessages([msg.key])

      // =========================
      // STATUS USER
      // =========================
      const isOwner = user === OWNER
      const isReseller = db.resellers[user]
      const isPremium = db.users[user] && db.users[user].expire > now()

      // =========================
      // BLOCK IF NOT LOGIN
      // =========================
      if (!isOwner && !isReseller && !isPremium) {
        if (text.startsWith(".")) {
          return sock.sendMessage(from, {
            text: `🔒 AKSES DITOLAK

Silakan login dulu:
.login NOMOR KEY

Hubungi Owner:
${OWNER}`
          })
        }
      }

      // =========================
      // GENERATE KEY (OWNER/RESELLER)
      // =========================
      if (text.startsWith(".genkey")) {
        if (!isOwner && !isReseller) {
          return sock.sendMessage(from, { text: "❌ Khusus reseller/owner" })
        }

        const jam = parseInt(text.split(" ")[1]) || 24
        const key = generateKey()

        db.keys[key] = {
          duration: jam * 3600000,
          used: false
        }

        saveDB()

        return sock.sendMessage(from, {
          text: `🔑 KEY PREMIUM

KEY: ${key}
DURASI: ${jam} JAM`
        })
      }

      // =========================
      // LOGIN SYSTEM
      // =========================
      if (text.startsWith(".login")) {
        const [, nomor, key] = text.split(" ")

        if (!db.keys[key]) {
          return sock.sendMessage(from, { text: "❌ Key salah" })
        }

        if (db.keys[key].used) {
          return sock.sendMessage(from, { text: "❌ Key sudah dipakai" })
        }

        db.users[nomor] = {
          expire: now() + db.keys[key].duration
        }

        db.keys[key].used = true
        saveDB()

        return sock.sendMessage(from, {
          text: "✅ LOGIN BERHASIL (PREMIUM AKTIF)"
        })
      }

      // =========================
      // EXPIRED CHECK
      // =========================
      if (isPremium && db.users[user].expire < now()) {
        delete db.users[user]
        saveDB()

        return sock.sendMessage(from, {
          text: `⛔ PREMIUM HABIS

Silakan perpanjang ke Owner:
${OWNER}`
        })
      }

      // =========================
      // MENU PREMIUM PERSONAL
      // =========================
      if (text === ".menu") {
        if (isOwner) {
          return sock.sendMessage(from, {
            text: `👑 OWNER MENU

.genkey 24
.addreseller nomor
.stats`
          })
        }

        if (isReseller) {
          return sock.sendMessage(from, {
            text: `💼 RESELLER MENU

.genkey 24
.cekuser
.topup`
          })
        }

        if (isPremium) {
          return sock.sendMessage(from, {
            text: `✨ PREMIUM MENU

.1 Joki Services
.2 Rekber System
.3 Payment
.4 VIP Tools
.5 Private Feature`
          })
        }
      }

      // =========================
      // PREMIUM MENU LIST
      // =========================
      if (text === ".1" && isPremium) {
        return sock.sendMessage(from, {
          text: `🔥 PREMIUM JOKI LIST

- Fast Leveling
- Full Mastery
- Raid Auto
- Race Unlock
- Sword Unlock
- Farming Bot`
        })
      }

      if (text === ".2" && isPremium) {
        return sock.sendMessage(from, {
          text: `💰 REKBER PREMIUM

Fee lebih murah & prioritas transaksi`
        })
      }

      if (text === ".3" && isPremium) {
        return sock.sendMessage(from, {
          text: `💳 PAYMENT VIP

QRIS / DANA / GOPAY / BANK`
        })
      }

      if (text === ".4" && isPremium) {
        return sock.sendMessage(from, {
          text: `⚡ VIP TOOLS

- Auto Farm
- Auto Quest
- Anti AFK
- Speed Boost`
        })
      }

      if (text === ".5" && isPremium) {
        return sock.sendMessage(from, {
          text: `🔒 PRIVATE FEATURES

Hanya user premium aktif`
        })
      }

    } catch (e) {
      console.log(e)
    }
  })
}

startBot()
