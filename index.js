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
// OWNER (SUDAH DISET)
// =========================
const ownerNumber = "6282162625200@s.whatsapp.net"

// =========================
// KEEP ALIVE
// =========================
const app = express()
app.get("/", (req, res) => res.send("Bot aktif 🚀"))
app.listen(3000, () => console.log("🌐 Web aktif"))

// =========================
// DATABASE
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
      // GENERATE KEY (OWNER ONLY)
      // =========================
      if (text.startsWith(".genkey") && sender === ownerNumber) {
        const dur = text.split(" ")[1] || "24"
        const key = generateKey()

        db.keys[key] = {
          used: false,
          duration: parseInt(dur) * 3600000
        }

        saveDB()

        return sock.sendMessage(from, {
          text: `🔑 KEY GENERATED

KEY: ${key}
DURASI: ${dur} JAM`
        })
      }

      // =========================
      // AUTO KIRIM KEY (SIMULASI PAYMENT)
      // =========================
      if (text.startsWith(".bayar") && sender === ownerNumber) {
        const nomor = text.split(" ")[1]
        const dur = text.split(" ")[2] || "24"

        if (!nomor) {
          return sock.sendMessage(from, {
            text: "Format:\n.bayar 628xxx 24"
          })
        }

        const jid = nomor + "@s.whatsapp.net"
        const key = generateKey()

        db.keys[key] = {
          used: false,
          duration: parseInt(dur) * 3600000
        }

        saveDB()

        await sock.sendMessage(jid, {
          text: `✅ PEMBAYARAN DITERIMA

🔑 KEY KAMU:
${key}

Gunakan:
.login ${nomor} ${key}`
        })

        return sock.sendMessage(from, {
          text: "✅ Key berhasil dikirim ke user"
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

        const jid = nomor + "@s.whatsapp.net"

        if (!db.keys[key]) {
          return sock.sendMessage(from, { text: "❌ Key salah" })
        }

        if (db.keys[key].used) {
          return sock.sendMessage(from, { text: "❌ Key sudah dipakai" })
        }

        db.users[jid] = {
          expired: Date.now() + db.keys[key].duration,
          menu: `📌 MENU USER

.1 Joki
.2 Rekber
.3 Payment`
        }

        db.keys[key].used = true
        saveDB()

        return sock.sendMessage(from, {
          text: "✅ Login sukses! ketik .menu"
        })
      }

      // =========================
      // CEK LOGIN
      // =========================
      if (!db.users[sender]) {
        if (text.startsWith(".")) {
          return sock.sendMessage(from, {
            text: `🔒 BELUM LOGIN

Hubungi owner:
082162625200`
          })
        }
        return
      }

      // =========================
      // EXPIRED CHECK
      // =========================
      if (Date.now() > db.users[sender].expired) {
        delete db.users[sender]
        saveDB()

        return sock.sendMessage(from, {
          text: "⛔ AKSES HABIS\nHubungi owner: 082162625200"
        })
      }

      // =========================
      // MENU
      // =========================
      if (text === ".menu") {
        return sock.sendMessage(from, {
          text: db.users[sender].menu
        })
      }

      // =========================
      // MENU 1
      // =========================
      if (text === ".1") {
        return sock.sendMessage(from, {
          text: "📌 JOKI LIST USER"
        })
      }

      // =========================
      // MENU 2
      // =========================
      if (text === ".2") {
        return sock.sendMessage(from, {
          text: "📌 REKBER LIST USER"
        })
      }

      // =========================
      // MENU 3
      // =========================
      if (text === ".3") {
        return sock.sendMessage(from, {
          text: "📌 PAYMENT INFO USER"
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
