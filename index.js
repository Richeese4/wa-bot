const P = require("pino")
const qrcode = require("qrcode-terminal")
const fs = require("fs")
const express = require("express")
const mongoose = require("mongoose")

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys")

// =========================
// CONFIG
// =========================
const OWNER_KEY = "freewilly123"
const OWNER_NUMBER = "6282162625200"

// =========================
// MONGO CONNECT
// =========================
const MONGO_URI =
  "mongodb+srv://znoidfamz_db_user:hHoRUaiak5EuQAft@znoidfamz.svbkerf.mongodb.net/bot?retryWrites=true&w=majority"

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 15000
})
.then(() => console.log("MongoDB CONNECTED"))
.catch(err => console.log("MongoDB ERROR:", err.message))

// =========================
// DATABASE
// =========================
const User = mongoose.model("User", new mongoose.Schema({
  key: String,
  role: {
    type: String,
    default: "user"
  },
  expired: Number,
  createdAt: Number
}))

const Session = mongoose.model("Session", new mongoose.Schema({
  group: String,
  admin: String,
  role: String,
  key: String,
  expired: Number,
  loginAt: Number
}))

const GroupSettings = mongoose.model("GroupSettings", new mongoose.Schema({
  group: String,
  antilink: {
    type: Boolean,
    default: false
  },
  maxwarn: {
    type: Number,
    default: 3
  },
  filterchat: {
    type: [String],
    default: []
  },
  warns: {
    type: Object,
    default: {}
  }
}))

// =========================
// EXPRESS
// =========================
const app = express()
app.get("/", (_, res) => {
  res.send("BOT ACTIVE")
})
app.listen(3000, () => {
  console.log("Express Running")
})

// =========================
// FORMAT
// =========================
function format(ms) {
  if (!ms || ms === 9999999999999) {
    return "Permanent"
  }
  return new Date(ms).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta"
  })
}

function isLink(text) {
  const regex = /(https?:\/\/|chat\.whatsapp\.com|wa\.me)/gi
  return regex.test(text)
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

  sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      qrcode.generate(qr, { small: true })
    }
    if (connection === "open") {
      console.log("BOT ONLINE")
    }
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) {
        startBot()
      }
    }
  })

  sock.ev.on("group-participants.update", async (m) => {
    try {
      if (m.action === "add") {
        for (let p of m.participants) {
          await sock.sendMessage(m.id, {
            image: fs.existsSync("./welcome.jpg") ? fs.readFileSync("./welcome.jpg") : { url: "https://placehold.co/600x400?text=Welcome" },
            caption: `👋 Welcome @${p.split("@")[0]}`,
            mentions: [p]
          })
        }
      }
      if (m.action === "remove") {
        for (let p of m.participants) {
          await sock.sendMessage(m.id, {
            image: fs.existsSync("./keluar.jpg") ? fs.readFileSync("./keluar.jpg") : { url: "https://placehold.co/600x400?text=Goodbye" },
            caption: `👋 @${p.split("@")[0]} keluar`,
            mentions: [p]
          })
        }
      }
    } catch (e) {
      console.log(e)
    }
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0]
      if (!msg.message || msg.key.remoteJid === "status@broadcast") return
      
      // FIX: Bot tidak memproses pesannya sendiri
      if (msg.key.fromMe) return

      const from = msg.key.remoteJid
      const sender = (msg.key.participant || from).split(":")[0] + "@s.whatsapp.net"
      const isGroup = from.endsWith("@g.us")
      const botNumber = sock.user.id.split(":")[0] + "@s.whatsapp.net"

      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
      if (!text) return

      const command = text.trim().split(" ")[0].toLowerCase()

      // =========================
      // SETTINGS
      // =========================
      let settings = await GroupSettings.findOne({ group: from })
      if (!settings && isGroup) {
        settings = await GroupSettings.create({ group: from })
      }

      // =========================
      // FIX: REALTIME ADMIN CHECK
      // =========================
      let isAdmin = false
      let botAdmin = false
      if (isGroup) {
        const meta = await sock.groupMetadata(from)
        isAdmin = meta.participants.find(x => x.id === sender)?.admin !== null && meta.participants.find(x => x.id === sender)?.admin !== undefined
        botAdmin = meta.participants.find(x => x.id === botNumber)?.admin !== null && meta.participants.find(x => x.id === botNumber)?.admin !== undefined
      }

      // =========================
      // FIX: FILTER CHAT (Check if not command)
      // =========================
      if (isGroup && settings?.filterchat?.length > 0 && !isAdmin && !command.startsWith(".filterchat")) {
        const badWord = settings.filterchat.find(x => text.toLowerCase().includes(x.toLowerCase()))
        if (badWord) {
          return await sock.sendMessage(from, { delete: msg.key })
        }
      }

      // =========================
      // ANTILINK
      // =========================
      if (settings?.antilink && isGroup && isLink(text) && !isAdmin && sender !== OWNER_NUMBER + "@s.whatsapp.net") {
        if (botAdmin) {
          await sock.sendMessage(from, { delete: msg.key })
          
          let warns = settings.warns || {}
          warns[sender] = (warns[sender] || 0) + 1
          settings.warns = warns
          settings.markModified('warns') 
          await settings.save()

          if (warns[sender] >= settings.maxwarn) {
            await sock.sendMessage(from, {
              text: `🚫 @${sender.split("@")[0]} dikeluar karena mencapai batas link!`,
              mentions: [sender]
            })
            await sock.groupParticipantsUpdate(from, [sender], "remove")
            delete warns[sender]
            settings.warns = warns
            settings.markModified('warns')
            await settings.save()
          } else {
            return sock.sendMessage(from, {
              text: `⚠️ Warning ${warns[sender]}/${settings.maxwarn}\nJangan kirim link!\nSisa: ${settings.maxwarn - warns[sender]}`,
              mentions: [sender]
            })
          }
          return
        }
      }

      // =========================
      // SESSION SYSTEM
      // =========================
      let session = isGroup ? await Session.findOne({ group: from }) : null

      if (!session && command.startsWith(".") && command !== ".login") {
        if (!isGroup) return
        return sock.sendMessage(from, { text: "❌ Admin group belum login\n\nSilahkan login:\n.login key" })
      }

      // =========================
      // COMMANDS
      // =========================
      if (command === ".login") {
        if (!isGroup) return sock.sendMessage(from, { text: "❌ Login hanya di group" })
        const inputKey = text.split(" ")[1]
        if (!inputKey) return sock.sendMessage(from, { text: ".login KEY-XXXX" })

        const isOwner = inputKey === OWNER_KEY
        if (!isAdmin && !isOwner) return sock.sendMessage(from, { text: "❌ Hanya admin group" })

        if (isOwner) {
          await Session.findOneAndUpdate({ group: from }, {
            group: from, admin: sender, role: "owner", key: inputKey, expired: 9999999999999, loginAt: Date.now()
          }, { upsert: true })
          return sock.sendMessage(from, { text: "👑 OWNER LOGIN SUCCESS\n✅ Bot aktif" })
        }

        const data = await User.findOne({ key: inputKey.trim().toUpperCase() })
        if (!data || Date.now() > data.expired) return sock.sendMessage(from, { text: "❌ Key invalid / expired" })

        await Session.findOneAndUpdate({ group: from }, {
          group: from, admin: sender, role: data.role, key: data.key, expired: data.expired, loginAt: Date.now()
        }, { upsert: true })

        return sock.sendMessage(from, {
          text: `✅ LOGIN SUCCESS\n\n👮 Admin: @${sender.split("@")[0]}\n📅 Expired: ${format(data.expired)}`,
          mentions: [sender]
        })
      }

      session = isGroup ? await Session.findOne({ group: from }) : null
      if (!session) return

      if (session.expired !== 9999999999999 && Date.now() > session.expired) {
        await Session.deleteOne({ group: from })
        return sock.sendMessage(from, { text: "❌ Session expired" })
      }

      const currentRole = session.role || "user"
      const userLimit = [".menu", ".linkgroup", ".sticker", ".masaaktif", ".owner", ".contact", ".sewabot"]

      if (currentRole === "user" && command.startsWith(".") && !userLimit.includes(command)) {
        return sock.sendMessage(from, { text: "❌ Akses user terbatas" })
      }

      if (command === ".menu") {
        let menuTxt = currentRole === "owner" ? `👑 OWNER MENU\n\n🔑 KEY SYSTEM\n.genkey <hari>\n.genprem <hari>\n\n🛠 PANEL\n.panel\n.addtime <key> <hari>\n.deltime <key> <hari>\n.delkey <key>\n\n👮 GROUP\n.antilink on/off\n.autokick <jumlah>\n.filterchat add <kata>\n.filterchat del <kata>\n.kick\n\n📌 OTHER\n.linkgroup\n.sticker` :
                     currentRole === "premium" ? `⭐ PREMIUM MENU\n\n👮 GROUP\n.antilink on/off\n.autokick <jumlah>\n.filterchat add <kata>\n.filterchat del <kata>\n.kick\n\n📌 OTHER\n.linkgroup\n.sticker\n.owner` :
                     `📌 USER MENU\n\n.linkgroup\n.sticker\n.masaaktif\n.owner`
        return sock.sendMessage(from, { text: menuTxt })
      }

      if (command === ".antilink") {
        if (currentRole !== "premium" && currentRole !== "owner") return
        if (!isAdmin) return sock.sendMessage(from, { text: "❌ Khusus admin" })
        const val = text.split(" ")[1]
        if (!["on", "off"].includes(val)) return sock.sendMessage(from, { text: ".antilink on/off" })
        settings.antilink = (val === "on")
        await settings.save()
        return sock.sendMessage(from, { text: `✅ Antilink ${val}` })
      }

      if (command === ".filterchat") {
        if (currentRole !== "premium" && currentRole !== "owner") return
        if (!isAdmin) return sock.sendMessage(from, { text: "❌ Khusus admin" })
        const action = text.split(" ")[1]
        const word = text.split(" ").slice(2).join(" ")
        if (!action) return sock.sendMessage(from, { text: ".filterchat add kata\n.filterchat del kata" })

        if (action === "add") {
          if (!word) return
          if (!settings.filterchat.includes(word)) {
            settings.filterchat.push(word)
            await settings.save()
          }
          return sock.sendMessage(from, { text: `✅ Ditambahkan: ${word}` })
        }
        if (action === "del") {
          settings.filterchat = settings.filterchat.filter(x => x !== word)
          await settings.save()
          return sock.sendMessage(from, { text: `✅ Dihapus: ${word}` })
        }
      }

      if (command === ".kick") {
        if (currentRole !== "premium" && currentRole !== "owner") return
        if (!isAdmin) return sock.sendMessage(from, { text: "❌ Khusus admin" })
        if (!botAdmin) return sock.sendMessage(from, { text: "❌ Bot bukan admin" })
        let target = msg.message.extendedTextMessage?.contextInfo?.participant || (text.split(" ")[1] ? text.split(" ")[1].replace(/[^0-9]/g, "") + "@s.whatsapp.net" : null)
        if (!target) return sock.sendMessage(from, { text: "Tag atau masukkan nomor" })
        await sock.groupParticipantsUpdate(from, [target], "remove")
        return sock.sendMessage(from, { text: "✅ Berhasil kick" })
      }

      if (command === ".linkgroup") {
        if (!botAdmin) return sock.sendMessage(from, { text: "❌ Bot bukan admin" })
        const code = await sock.groupInviteCode(from)
        return sock.sendMessage(from, { text: "https://chat.whatsapp.com/" + code })
      }

      if (command === ".genkey" && currentRole === "owner") {
        const hari = parseInt(text.split(" ")[1])
        if (!hari) return sock.sendMessage(from, { text: ".genkey 7" })
        const key = "KEY-" + Math.random().toString(36).slice(2, 10).toUpperCase()
        const exp = Date.now() + (hari * 86400000)
        await User.create({ key, role: "user", expired: exp, createdAt: Date.now() })
        return sock.sendMessage(from, { text: `✅ USER KEY\n\n🔑 ${key}\n⏳ ${hari} Hari\n📅 ${format(exp)}` })
      }

      if (command === ".genprem" && currentRole === "owner") {
        const hari = parseInt(text.split(" ")[1])
        if (!hari) return sock.sendMessage(from, { text: ".genprem 30" })
        const key = "PREM-" + Math.random().toString(36).slice(2, 10).toUpperCase()
        const exp = Date.now() + (hari * 86400000)
        await User.create({ key, role: "premium", expired: exp, createdAt: Date.now() })
        return sock.sendMessage(from, { text: `⭐ PREMIUM KEY\n\n🔑 ${key}\n⏳ ${hari} Hari\n📅 ${format(exp)}` })
      }

      if (command === ".masaaktif") {
        return sock.sendMessage(from, { text: `📅 MASA AKTIF BOT\n\nExpired:\n${format(session.expired)}` })
      }
      
      if (command === ".owner") {
         return sock.sendMessage(from, { text: `📞 CONTACT OWNER\n\nwa.me/${OWNER_NUMBER}` })
      }

    } catch (e) {
      console.log("ERROR:", e.message)
    }
  })
}

startBot()
