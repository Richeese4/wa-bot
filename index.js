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
const MONGO_URI = "mongodb+srv://znoidfamz_db_user:hHoRUaiak5EuQAft@znoidfamz.svbkerf.mongodb.net/bot?retryWrites=true&w=majority"

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
  role: { type: String, default: "user" },
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
  antilink: { type: Boolean, default: false },
  maxwarn: { type: Number, default: 3 },
  filterchat: { type: [String], default: [] },
  warns: { type: Object, default: {} } // Field Object sensitif di Mongoose
}))

// =========================
// EXPRESS
// =========================
const app = express()
app.get("/", (_, res) => res.send("BOT ACTIVE"))
app.listen(3000, () => console.log("Express Running"))

// =========================
// FORMAT & UTILS
// =========================
function format(ms) {
  if (!ms || ms === 9999999999999) return "Permanent"
  return new Date(ms).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
}

function isLink(text) {
  // Regex diperkuat untuk mendeteksi berbagai jenis link WhatsApp dan umum
  const regex = /(https?:\/\/|chat\.whatsapp\.com|wa\.me|whatsapp\.com\/[a-zA-Z0-9]+)/gi
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
    printQRInTerminal: true
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {
    if (qr) qrcode.generate(qr, { small: true })
    if (connection === "open") console.log("BOT ONLINE")
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) startBot()
    }
  })

  sock.ev.on("group-participants.update", async (m) => {
    try {
      if (m.action === "add") {
        for (let p of m.participants) {
          await sock.sendMessage(m.id, {
            image: fs.existsSync("./welcome.jpg") ? fs.readFileSync("./welcome.jpg") : { url: 'https://placehold.co/600x400?text=Welcome' },
            caption: `👋 Welcome @${p.split("@")[0]}`,
            mentions: [p]
          })
        }
      }
      if (m.action === "remove") {
        for (let p of m.participants) {
          await sock.sendMessage(m.id, {
            image: fs.existsSync("./keluar.jpg") ? fs.readFileSync("./keluar.jpg") : { url: 'https://placehold.co/600x400?text=Goodbye' },
            caption: `👋 @${p.split("@")[0]} keluar`,
            mentions: [p]
          })
        }
      }
    } catch (e) { console.log(e) }
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0]
      if (!msg.message || msg.key.remoteJid === "status@broadcast") return

      const from = msg.key.remoteJid
      const sender = (msg.key.participant || from).split(":")[0] + "@s.whatsapp.net"
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
      if (!text && !msg.message.extendedTextMessage) return

      const isGroup = from.endsWith("@g.us")
      const cmd = text.trim()
      const command = cmd.split(" ")[0].toLowerCase()

      // Ambil Settings Group
      let settings = await GroupSettings.findOne({ group: from })
      if (!settings && isGroup) settings = await GroupSettings.create({ group: from })

      // Admin Check
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
      // ANTILINK LOGIC (FIXED)
      // =========================
      if (settings?.antilink && isGroup && isLink(text)) {
        // Abaikan jika Admin, Owner, atau pesan Bot sendiri
        if (!isAdmin && !sender.includes(OWNER_NUMBER) && !msg.key.fromMe) {
          if (botAdmin) {
            // 1. Hapus pesan segera
            await sock.sendMessage(from, { delete: msg.key })

            // 2. Update Warning
            let currentWarns = settings.warns || {}
            if (!currentWarns[sender]) currentWarns[sender] = 0
            currentWarns[sender] += 1
            
            settings.warns = currentWarns
            settings.markModified('warns') // WAJIB untuk tipe data Object
            await settings.save()

            // 3. Cek Max Warn
            if (currentWarns[sender] >= settings.maxwarn) {
              await sock.sendMessage(from, {
                text: `🚫 @${sender.split("@")[0]} dikeluar karena mencapai batas warning link.`,
                mentions: [sender]
              })
              await sock.groupParticipantsUpdate(from, [sender], "remove")
              
              // Reset warn setelah kick
              delete currentWarns[sender]
              settings.warns = currentWarns
              settings.markModified('warns')
              await settings.save()
            } else {
              await sock.sendMessage(from, {
                text: `⚠️ Link Terdeteksi!\n\nUser: @${sender.split("@")[0]}\nWarning: ${currentWarns[sender]}/${settings.maxwarn}\nJangan kirim link grup lain!`,
                mentions: [sender]
              })
            }
            return // Stop proses command lain jika ini adalah link
          }
        }
      }

      // =========================
      // FILTER CHAT
      // =========================
      if (isGroup && settings?.filterchat?.length > 0) {
        const bad = settings.filterchat.find(x => text.toLowerCase().includes(x.toLowerCase()))
        if (bad && !isAdmin && !msg.key.fromMe) {
          await sock.sendMessage(from, { delete: msg.key })
          return
        }
      }

      // =========================
      // SESSION SYSTEM
      // =========================
      let session = isGroup ? await Session.findOne({ group: from }) : null

      if (!session && command.startsWith(".") && command !== ".login") {
        if (!isGroup) return
        return sock.sendMessage(from, { text: `❌ Admin group belum login\n\nSilahkan login:\n.login key` })
      }

      // LOGIN
      if (command === ".login") {
        if (!isGroup) return sock.sendMessage(from, { text: "❌ Login hanya di group" })
        const inputKey = cmd.split(" ")[1]?.toUpperCase()
        if (!inputKey) return sock.sendMessage(from, { text: ".login KEY-XXXX" })

        const isOwner = inputKey === OWNER_KEY
        if (!isAdmin && !isOwner) return sock.sendMessage(from, { text: "❌ Hanya admin group" })

        if (isOwner) {
          await Session.findOneAndUpdate({ group: from }, {
            group: from, admin: sender, role: "owner", key: inputKey, expired: 9999999999999, loginAt: Date.now()
          }, { upsert: true })
          return sock.sendMessage(from, { text: `👑 OWNER LOGIN SUCCESS\n\n✅ Bot aktif` })
        }

        const data = await User.findOne({ key: inputKey })
        if (!data || Date.now() > data.expired) return sock.sendMessage(from, { text: "❌ Key invalid / expired" })

        await Session.findOneAndUpdate({ group: from }, {
          group: from, admin: sender, role: data.role, key: data.key, expired: data.expired, loginAt: Date.now()
        }, { upsert: true })

        return sock.sendMessage(from, {
          text: `✅ LOGIN SUCCESS\n\n👮 Admin: @${sender.split("@")[0]}\n📅 Expired: ${format(data.expired)}`,
          mentions: [sender]
        })
      }

      if (!session) return
      const currentRole = session.role || "user"

      // CEK EXPIRED SESSION
      if (session.expired !== 9999999999999 && Date.now() > session.expired) {
        await Session.deleteOne({ group: from })
        return sock.sendMessage(from, { text: "❌ Session expired" })
      }

      // USER LIMIT
      const userLimit = [".menu", ".linkgroup", ".sticker", ".masaaktif", ".owner", ".contact", ".sewabot"]
      if (currentRole === "user" && command.startsWith(".") && !userLimit.includes(command)) {
        return sock.sendMessage(from, { text: "❌ Akses user terbatas" })
      }

      // =========================
      // COMMANDS
      // =========================
      if (command === ".menu") {
        let menuTxt = ""
        if (currentRole === "owner") {
          menuTxt = `👑 OWNER MENU\n\n.genkey <hari>\n.genprem <hari>\n.panel\n.addtime <key> <hari>\n.deltime <key> <hari>\n.delkey <key>\n\n👮 GROUP\n.antilink on/off\n.autokick <jumlah>\n.filterchat add <kata>\n.filterchat del <kata>\n.kick`
        } else if (currentRole === "premium") {
          menuTxt = `⭐ PREMIUM MENU\n\n👮 GROUP\n.antilink on/off\n.autokick <jumlah>\n.filterchat add <kata>\n.filterchat del <kata>\n.kick\n\n📌 OTHER\n.linkgroup\n.sticker\n.owner`
        } else {
          menuTxt = `📌 USER MENU\n\n.linkgroup\n.sticker\n.masaaktif\n.owner`
        }
        return sock.sendMessage(from, { text: menuTxt })
      }

      if (command === ".antilink") {
        if (currentRole !== "premium" && currentRole !== "owner") return
        if (!isAdmin) return sock.sendMessage(from, { text: "❌ Khusus admin" })
        const val = cmd.split(" ")[1]
        if (!["on", "off"].includes(val)) return sock.sendMessage(from, { text: ".antilink on/off" })
        settings.antilink = val === "on"
        await settings.save()
        return sock.sendMessage(from, { text: `✅ Antilink ${val}` })
      }

      if (command === ".autokick") {
        if (currentRole !== "premium" && currentRole !== "owner") return
        if (!isAdmin) return sock.sendMessage(from, { text: "❌ Khusus admin" })
        const jml = parseInt(cmd.split(" ")[1])
        if (isNaN(jml)) return sock.sendMessage(from, { text: ".autokick 3" })
        settings.maxwarn = jml
        await settings.save()
        return sock.sendMessage(from, { text: `✅ AutoKick set: ${jml} warning` })
      }

      if (command === ".filterchat") {
        if (currentRole !== "premium" && currentRole !== "owner") return
        if (!isAdmin) return sock.sendMessage(from, { text: "❌ Khusus admin" })
        const action = cmd.split(" ")[1]
        const word = cmd.split(" ").slice(2).join(" ")
        if (action === "add" && word) {
          if (!settings.filterchat.includes(word)) {
            settings.filterchat.push(word)
            await settings.save()
          }
          return sock.sendMessage(from, { text: `✅ Ditambahkan: ${word}` })
        }
        if (action === "del" && word) {
          settings.filterchat = settings.filterchat.filter(x => x !== word)
          await settings.save()
          return sock.sendMessage(from, { text: `✅ Dihapus: ${word}` })
        }
        return sock.sendMessage(from, { text: ".filterchat add/del kata" })
      }

      if (command === ".kick") {
        if (currentRole !== "premium" && currentRole !== "owner") return
        if (!isAdmin) return sock.sendMessage(from, { text: "❌ Khusus admin" })
        if (!botAdmin) return sock.sendMessage(from, { text: "❌ Bot bukan admin" })
        let target = msg.message.extendedTextMessage?.contextInfo?.participant || (cmd.split(" ")[1] ? cmd.split(" ")[1].replace(/[^0-9]/g, "") + "@s.whatsapp.net" : null)
        if (!target) return sock.sendMessage(from, { text: "Tag atau masukkan nomor" })
        await sock.groupParticipantsUpdate(from, [target], "remove")
        return sock.sendMessage(from, { text: "✅ Berhasil kick" })
      }

      if (command === ".genkey" || command === ".genprem") {
        if (currentRole !== "owner") return
        const hari = parseInt(cmd.split(" ")[1])
        if (!hari) return sock.sendMessage(from, { text: `${command} 7` })
        const role = command === ".genkey" ? "user" : "premium"
        const prefix = role === "user" ? "KEY-" : "PREM-"
        const key = prefix + Math.random().toString(36).slice(2, 10).toUpperCase()
        const exp = Date.now() + (hari * 86400000)
        await User.create({ key, role, expired: exp, createdAt: Date.now() })
        return sock.sendMessage(from, { text: `✅ ${role.toUpperCase()} KEY\n\n🔑 ${key}\n⏳ ${hari} Hari\n📅 ${format(exp)}` })
      }

      if (command === ".masaaktif") {
        return sock.sendMessage(from, { text: `📅 MASA AKTIF BOT\n\nExpired: ${format(session.expired)}` })
      }
      
      if (command === ".linkgroup") {
        if (!botAdmin) return sock.sendMessage(from, { text: "Bot bukan admin" })
        const code = await sock.groupInviteCode(from)
        return sock.sendMessage(from, { text: "https://chat.whatsapp.com/" + code })
      }

      // ... (lanjutkan command lainnya seperti .panel, .addtime sesuai pola di atas)

    } catch (e) { console.log("ERROR:", e) }
  })
}

startBot()
