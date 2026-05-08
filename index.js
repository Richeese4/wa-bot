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
    auth: state,
    printQRInTerminal: false // Menggunakan qrcode-terminal manual di bawah
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

      const from = msg.key.remoteJid
      const sender = (msg.key.participant || from).split(":")[0] + "@s.whatsapp.net"
      
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
      if (!text) return

      const cmd = text.trim()
      const command = cmd.split(" ")[0].toLowerCase()
      const isGroup = from.endsWith("@g.us")

      // =========================
      // SETTINGS
      // =========================
      let settings = await GroupSettings.findOne({ group: from })
      if (!settings && isGroup) {
        settings = await GroupSettings.create({ group: from })
      }

      // =========================
      // ADMIN CHECK
      // =========================
      let isAdmin = false
      let botAdmin = false
      if (isGroup) {
        const meta = await sock.groupMetadata(from)
        const member = meta.participants.find(x => x.id === sender)
        const bot = meta.participants.find(x => x.id.includes(sock.user.id.split(":")[0]))
        isAdmin = !!member?.admin
        botAdmin = !!bot?.admin
      }

      // =========================
      // SESSION
      // =========================
      let session = isGroup ? await Session.findOne({ group: from }) : null

      // BLOCK BELUM LOGIN
      if (!session && command.startsWith(".") && command !== ".login") {
        if (!isGroup) return
        return sock.sendMessage(from, { text: "❌ Admin group belum login\n\nSilahkan login:\n.login key" })
      }

      // =========================
      // LOGIN
      // =========================
      if (command === ".login") {
        if (!isGroup) return sock.sendMessage(from, { text: "❌ Login hanya di group" })
        const inputKey = cmd.split(" ")[1]
        if (!inputKey) return sock.sendMessage(from, { text: ".login KEY-XXXX" })

        const isOwner = inputKey === OWNER_KEY
        if (!isAdmin && !isOwner) return sock.sendMessage(from, { text: "❌ Hanya admin group" })

        if (isOwner) {
          await Session.findOneAndUpdate(
            { group: from },
            { group: from, admin: sender, role: "owner", key: inputKey, expired: 9999999999999, loginAt: Date.now() },
            { upsert: true }
          )
          return sock.sendMessage(from, { text: `👑 OWNER LOGIN SUCCESS\n\n✅ Bot aktif` })
        }

        const data = await User.findOne({ key: inputKey.trim().toUpperCase() })
        if (!data || Date.now() > data.expired) {
          return sock.sendMessage(from, { text: "❌ Key invalid / expired" })
        }

        await Session.findOneAndUpdate(
          { group: from },
          { group: from, admin: sender, role: data.role, key: data.key, expired: data.expired, loginAt: Date.now() },
          { upsert: true }
        )
        return sock.sendMessage(from, { 
          text: `✅ LOGIN SUCCESS\n\n👮 Admin:\n@${sender.split("@")[0]}\n\n📅 Expired:\n${format(data.expired)}`,
          mentions: [sender]
        })
      }

      // REFRESH SESSION
      session = isGroup ? await Session.findOne({ group: from }) : null
      if (!session) return

      // EXPIRED CHECK
      if (session.expired !== 9999999999999 && Date.now() > session.expired) {
        await Session.deleteOne({ group: from })
        return sock.sendMessage(from, { text: "❌ Session expired" })
      }

      const currentRole = session.role || "user"

      // USER LIMIT
      const userLimit = [".menu", ".linkgroup", ".sticker", ".masaaktif", ".owner", ".contact", ".sewabot"]
      if (currentRole === "user" && command.startsWith(".") && !userLimit.includes(command)) {
        return sock.sendMessage(from, { text: "❌ Akses user terbatas" })
      }

      // =========================
      // FILTER CHAT
      // =========================
      if (isGroup && settings.filterchat.length > 0) {
        const bad = settings.filterchat.find(x => text.toLowerCase().includes(x.toLowerCase()))
        if (bad && !isAdmin) {
          await sock.sendMessage(from, { delete: msg.key })
          return
        }
      }

      // =========================
      // ANTILINK (FIXED)
      // =========================
      if (settings?.antilink && isGroup && isLink(text)) {
        if (isAdmin || sender.includes(OWNER_NUMBER.replace(/[^0-9]/g, ""))) return
        if (!botAdmin) return

        let warns = settings.warns || {}
        if (!warns[sender]) warns[sender] = 0
        
        warns[sender] += 1
        
        // CRITICAL FIX: Memberitahu Mongoose bahwa object 'warns' berubah
        settings.warns = warns
        settings.markModified('warns') 
        await settings.save()

        await sock.sendMessage(from, { delete: msg.key })

        if (warns[sender] >= settings.maxwarn) {
          await sock.sendMessage(from, { 
            text: `🚫 @${sender.split("@")[0]} dikeluarkan karena spam link`, 
            mentions: [sender] 
          })
          await sock.groupParticipantsUpdate(from, [sender], "remove")
          
          delete warns[sender]
          settings.warns = warns
          settings.markModified('warns')
          await settings.save()
          return
        }

        return sock.sendMessage(from, {
          text: `⚠️ Warning ${warns[sender]}/${settings.maxwarn}\n\nJangan kirim link lagi\nSisa warning: ${settings.maxwarn - warns[sender]}`,
          mentions: [sender]
        })
      }

      // =========================
      // COMMANDS
      // =========================
      if (command === ".menu") {
        let menuTxt = ""
        if (currentRole === "owner") {
          menuTxt = `👑 OWNER MENU\n\n🔑 KEY SYSTEM\n.genkey <hari>\n.genprem <hari>\n\n🛠 PANEL\n.panel\n.addtime <key> <hari>\n.deltime <key> <hari>\n.delkey <key>\n\n👮 GROUP\n.antilink on/off\n.autokick <jumlah>\n.filterchat add <kata>\n.filterchat del <kata>\n.kick\n\n📌 OTHER\n.linkgroup\n.sticker`
        } else if (currentRole === "premium") {
          menuTxt = `⭐ PREMIUM MENU\n\n👮 GROUP\n.antilink on/off\n.autokick <jumlah>\n.filterchat add <kata>\n.filterchat del <kata>\n.kick\n\n📌 OTHER\n.linkgroup\n.sticker\n.owner`
        } else {
          menuTxt = `📌 USER MENU\n\n.linkgroup\n.sticker\n.masaaktif\n.owner`
        }
        return sock.sendMessage(from, { text: menuTxt })
      }

      if (command === ".owner") {
        return sock.sendMessage(from, { text: `👑 OWNER MENU\n\n.contact\n.sewabot` })
      }

      if (command === ".contact") {
        return sock.sendMessage(from, { text: `📞 CONTACT OWNER\n\nwa.me/${OWNER_NUMBER}` })
      }

      if (command === ".sewabot") {
        return sock.sendMessage(from, { text: `📦 LIST SEWA BOT\n\n⭐ USER\n5K = 7 Hari\n10K = 30 Hari\n\n👑 PREMIUM\n15K = 30 Hari\n25K = 90 Hari\n\n📞 ORDER:\nwa.me/${OWNER_NUMBER}` })
      }

      if (command === ".antilink") {
        if (currentRole !== "premium" && currentRole !== "owner") return
        if (!isAdmin) return sock.sendMessage(from, { text: "❌ Khusus admin" })
        const value = cmd.split(" ")[1]
        if (!["on", "off"].includes(value)) return sock.sendMessage(from, { text: ".antilink on\n.antilink off" })
        settings.antilink = (value === "on")
        await settings.save()
        return sock.sendMessage(from, { text: `✅ Antilink ${value}` })
      }

      if (command === ".autokick") {
        if (currentRole !== "premium" && currentRole !== "owner") return
        if (!isAdmin) return sock.sendMessage(from, { text: "❌ Khusus admin" })
        const jumlah = parseInt(cmd.split(" ")[1])
        if (!jumlah || jumlah < 1) return sock.sendMessage(from, { text: ".autokick 3" })
        settings.maxwarn = jumlah
        await settings.save()
        return sock.sendMessage(from, { text: `✅ AutoKick:\n${jumlah} warning` })
      }

      if (command === ".filterchat") {
        if (currentRole !== "premium" && currentRole !== "owner") return
        if (!isAdmin) return sock.sendMessage(from, { text: "❌ Khusus admin" })
        const action = cmd.split(" ")[1]
        const word = cmd.split(" ").slice(2).join(" ")
        if (!action) return sock.sendMessage(from, { text: ".filterchat add kata\n.filterchat del kata" })

        if (action === "add") {
          if (!word) return
          if (!settings.filterchat.includes(word)) {
            settings.filterchat.push(word)
            await settings.save()
          }
          return sock.sendMessage(from, { text: `✅ Ditambahkan:\n${word}` })
        }

        if (action === "del") {
          settings.filterchat = settings.filterchat.filter(x => x !== word)
          await settings.save()
          return sock.sendMessage(from, { text: `✅ Dihapus:\n${word}` })
        }
      }

      if (command === ".kick") {
        if (currentRole !== "premium" && currentRole !== "owner") return
        if (!isAdmin) return sock.sendMessage(from, { text: "❌ Khusus admin" })
        if (!botAdmin) return sock.sendMessage(from, { text: "❌ Bot bukan admin" })

        let target = msg.message.extendedTextMessage?.contextInfo?.participant
        if (!target) {
          const nomor = cmd.split(" ")[1]
          if (!nomor) return sock.sendMessage(from, { text: ".kick 628xxxx" })
          target = nomor.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
        }

        await sock.groupParticipantsUpdate(from, [target], "remove")
        return sock.sendMessage(from, { text: "✅ Berhasil kick member" })
      }

      if (command === ".linkgroup") {
        if (!botAdmin) return sock.sendMessage(from, { text: "❌ Bot bukan admin" })
        const code = await sock.groupInviteCode(from)
        return sock.sendMessage(from, { text: "https://chat.whatsapp.com/" + code })
      }

      if (command === ".sticker") {
        return sock.sendMessage(from, { text: "✅ Sticker system aktif" })
      }

      if (command === ".masaaktif") {
        return sock.sendMessage(from, { text: `📅 MASA AKTIF BOT\n\nExpired:\n${format(session.expired)}` })
      }

      // OWNER ONLY COMMANDS
      if (currentRole === "owner") {
        if (command === ".genkey" || command === ".genprem") {
          const hari = parseInt(cmd.split(" ")[1])
          if (!hari) return sock.sendMessage(from, { text: `${command} 7` })
          const isPrem = command === ".genprem"
          const key = (isPrem ? "PREM-" : "KEY-") + Math.random().toString(36).slice(2, 10).toUpperCase()
          const exp = Date.now() + (hari * 86400000)
          await User.create({ key, role: isPrem ? "premium" : "user", expired: exp, createdAt: Date.now() })
          return sock.sendMessage(from, { text: `✅ ${isPrem ? "PREMIUM" : "USER"} KEY\n\n🔑 ${key}\n⏳ ${hari} Hari\n📅 ${format(exp)}` })
        }

        if (command === ".addtime" || command === ".deltime") {
          const key = cmd.split(" ")[1]
          const hari = parseInt(cmd.split(" ")[2])
          const user = await User.findOne({ key })
          if (!user) return sock.sendMessage(from, { text: "❌ Key tidak ditemukan" })
          user.expired += (command === ".addtime" ? 1 : -1) * (hari * 86400000)
          await user.save()
          return sock.sendMessage(from, { text: `✅ Masa aktif diperbarui\n\n${key}\n${format(user.expired)}` })
        }

        if (command === ".delkey") {
          const key = cmd.split(" ")[1]
          const res = await User.deleteOne({ key })
          return sock.sendMessage(from, { text: res.deletedCount ? `✅ Key dihapus\n\n${key}` : "❌ Key tidak ditemukan" })
        }

        if (command === ".panel") {
          const all = await User.find()
          let txt = "📌 ACTIVE KEYS\n\n"
          all.forEach((x, i) => {
            txt += `${i + 1}. ${x.key}\nRole: ${x.role}\nExpired: ${format(x.expired)}\n\n`
          })
          return sock.sendMessage(from, { text: txt })
        }
      }

    } catch (e) {
      console.log("ERROR:", e.message)
    }
  })
}

startBot()
