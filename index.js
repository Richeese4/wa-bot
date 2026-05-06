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
const owner = "6282162625200"

// =========================
// NORMALIZE JID
// =========================
function cleanJid(jid) {
  return jid.split("@")[0]
}

// =========================
// KEEP ALIVE
// =========================
const app = express()
app.get("/", (req, res) => res.send("Bot aktif 🚀"))
app.listen(3000, () => console.log("🌐 Web aktif"))

// =========================
// DATABASE SIMPLE
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
// GENERATE KEY
// =========================
function generateKey(len = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let key = ""
  for (let i = 0; i < len; i++) {
    key += chars[Math.floor(Math.random() * chars.length)]
  }
  return key
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

    if (qr) qrcode.generate(qr, { small: true })
    if (connection === "open") console.log("BOT AKTIF")

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

      const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ""
      ).trim()

      await sock.readMessages([msg.key])

      // =========================
      // NORMAL USER INFO
      // =========================
      const senderNumber = cleanJid(sender)

      const isOwner = senderNumber === owner
      const isReseller = db.resellers?.[senderNumber]
      const isLoggedIn = !!db.users[senderNumber]

      // =========================
      // GENKEY (OWNER + RESELLER)
      // =========================
      if (text.startsWith(".genkey")) {
        if (!isOwner && !isReseller) {
          return sock.sendMessage(from, {
            text: "❌ Khusus owner / reseller"
          })
        }

        const dur = text.split(" ")[1] || "24"
        const key = generateKey()

        db.keys[key] = {
          used: false,
          duration: parseInt(dur) * 3600000
        }

        saveDB()

        return sock.sendMessage(from, {
          text: `🔑 KEY BERHASIL DIGENERATE

KEY: ${key}
DURASI: ${dur} JAM`
        })
      }

      // =========================
      // ADD RESELLER (OWNER ONLY)
      // =========================
      if (text.startsWith(".addreseller")) {
        if (!isOwner) return

        const nomor = text.split(" ")[1]
        if (!nomor) return

        db.resellers[nomor] = true
        saveDB()

        return sock.sendMessage(from, {
          text: `✅ Reseller ditambahkan: ${nomor}`
        })
      }

      // =========================
      // LOGIN SYSTEM
      // =========================
      if (text.startsWith(".login")) {
        const args = text.split(" ")
        const nomor = args[1]
        const key = args[2]

        if (!nomor || !key) {
          return sock.sendMessage(from, {
            text: "Format:\n.login 628xxx KEY"
          })
        }

        if (!db.keys[key]) {
          return sock.sendMessage(from, {
            text: "❌ Key salah"
          })
        }

        if (db.keys[key].used) {
          return sock.sendMessage(from, {
            text: "❌ Key sudah dipakai"
          })
        }

        db.users[nomor] = {
          expired: Date.now() + db.keys[key].duration
        }

        db.keys[key].used = true
        saveDB()

        return sock.sendMessage(from, {
          text: "✅ LOGIN BERHASIL\nKetik .menu"
        })
      }

      // =========================
      // 🔥 FIX LOGIN FILTER (INI PENTING)
      // =========================
      if (!isOwner && !isReseller && !isLoggedIn) {
        if (text.startsWith(".")) {
          return sock.sendMessage(from, {
            text: `🔒 HARUS LOGIN

Hubungi owner:
082162625200`
          })
        }
        return
      }

      // =========================
      // EXPIRED CHECK
      // =========================
      if (!isOwner && !isReseller && isLoggedIn) {
        if (Date.now() > db.users[senderNumber].expired) {
          delete db.users[senderNumber]
          saveDB()

          return sock.sendMessage(from, {
            text: "⛔ AKSES HABIS\nHubungi owner: 082162625200"
          })
        }
      }

      // =========================
      // MENU
      // =========================
      if (text === ".menu") {
        return sock.sendMessage(from, {
          text: `📌 MENU USER

.1 Joki
.2 Rekber
.3 Payment`
        })
      }

      // =========================
      // MENU 1
      // =========================
      if (text === ".1") {
        return sock.sendMessage(from, {
          text: "📌 LIST JOKI USER"
        })
      }

      // =========================
      // MENU 2
      // =========================
      if (text === ".2") {
        return sock.sendMessage(from, {
          text: "📌 LIST REKBER USER"
        })
      }

      // =========================
      // MENU 3
      // =========================
      if (text === ".3") {
        return sock.sendMessage(from, {
          text: "📌 PAYMENT USER"
        })
      }

    } catch (err) {
      console.log(err)
    }
  })
}

// =========================
// RUN
// =========================
startBot()
