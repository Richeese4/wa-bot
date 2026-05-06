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
const owner = "628xxxxxxxxxx@s.whatsapp.net" // GANTI

// =========================
// KEEP ALIVE
// =========================
const app = express()
app.get("/", (req, res) => res.send("Bot aktif 🚀"))
app.listen(3000)

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
function generateKey(length = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
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

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) qrcode.generate(qr, { small: true })
    if (connection === "open") console.log("✅ BOT AKTIF")

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
      ).trim()

      await sock.readMessages([msg.key])

      // =========================
      // OWNER TAMBAH RESELLER
      // =========================
      if (text.startsWith(".addreseller") && sender === owner) {
        const nomor = text.split(" ")[1] + "@s.whatsapp.net"
        db.resellers[nomor] = true
        saveDB()

        return sock.sendMessage(from, {
          text: "✅ Reseller ditambahkan"
        })
      }

      // =========================
      // GENERATE KEY
      // =========================
      if (text.startsWith(".genkey")) {
        if (sender !== owner && !db.resellers[sender]) {
          return sock.sendMessage(from, {
            text: "❌ Khusus owner / reseller"
          })
        }

        const args = text.split(" ")
        const duration = args[1] || "24"

        const key = generateKey()

        db.keys[key] = {
          used: false,
          duration: parseInt(duration) * 3600000
        }

        saveDB()

        return sock.sendMessage(from, {
          text: `🔑 KEY

${key}
Durasi: ${duration} jam`
        })
      }

      // =========================
      // LOGIN
      // =========================
      if (text.startsWith(".login")) {
        const args = text.split(" ")
        const nomor = args[1]
        const key = args[2]

        if (!nomor || !key) {
          return sock.sendMessage(from, {
            text: "❌ Format:\n.login 628xxxx KEY"
          })
        }

        const jid = nomor + "@s.whatsapp.net"

        if (!db.keys[key]) {
          return sock.sendMessage(from, { text: "❌ Key tidak valid" })
        }

        if (db.keys[key].used) {
          return sock.sendMessage(from, { text: "❌ Key sudah dipakai" })
        }

        db.users[jid] = {
          expired: Date.now() + db.keys[key].duration,
          menu: `📌 MENU DEFAULT

.1 Menu 1
.2 Menu 2
.3 Menu 3`
        }

        db.keys[key].used = true
        saveDB()

        return sock.sendMessage(from, {
          text: "✅ Login berhasil!\nKetik .menu"
        })
      }

      // =========================
      // CEK LOGIN
      // =========================
      if (!db.users[sender]) {
        if (text.startsWith(".")) {
          return sock.sendMessage(from, {
            text: `🔒 Harus login!

Hubungi owner:
${owner.replace("@s.whatsapp.net", "")}`
          })
        }
        return
      }

      // =========================
      // EXPIRED
      // =========================
      if (Date.now() > db.users[sender].expired) {
        delete db.users[sender]
        saveDB()

        return sock.sendMessage(from, {
          text: "⛔ Akses habis, hubungi owner"
        })
      }

      // =========================
      // FILTER COMMAND
      // =========================
      if (!text.startsWith(".")) return

      // =========================
      // SET MENU (OWNER)
      // =========================
      if (text.startsWith(".setmenu") && sender === owner) {
        const nomor = text.split(" ")[1]
        const isi = text.split("|")[1]

        if (!nomor || !isi) {
          return sock.sendMessage(from, {
            text: "Format:\n.setmenu 628xxx | isi menu"
          })
        }

        const jid = nomor + "@s.whatsapp.net"

        if (!db.users[jid]) {
          return sock.sendMessage(from, {
            text: "User belum login"
          })
        }

        db.users[jid].menu = isi
        saveDB()

        return sock.sendMessage(from, {
          text: "✅ Menu berhasil di set"
        })
      }

      // =========================
      // MENU USER
      // =========================
      if (text === ".menu") {
        return sock.sendMessage(from, {
          text: db.users[sender].menu
        })
      }

      // =========================
      // MENU RESPON
      // =========================
      if (text === ".1") {
        return sock.sendMessage(from, {
          text: "📌 Respon menu 1 milik kamu"
        })
      }

      if (text === ".2") {
        return sock.sendMessage(from, {
          text: "📌 Respon menu 2 milik kamu"
        })
      }

      if (text === ".3") {
        return sock.sendMessage(from, {
          text: "📌 Respon menu 3 milik kamu"
        })
      }

    } catch (err) {
      console.log(err)
    }
  })
}

startBot()
