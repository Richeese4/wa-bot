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
// DATABASE MODELS
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
    warns: { type: Object, default: {} }
}))

// =========================
// EXPRESS SERVER
// =========================
const app = express()
app.get("/", (_, res) => res.send("BOT ACTIVE"))
app.listen(3000, () => console.log("Express Running"))

// =========================
// HELPERS
// =========================
function format(ms) {
    if (!ms || ms === 9999999999999) return "Permanent"
    return new Date(ms).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
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

    // WELCOME / LEAVE
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
        } catch (e) { console.log(e) }
    })

    // MESSAGE HANDLER
    sock.ev.on("messages.upsert", async ({ messages }) => {
        try {
            const msg = messages[0]
            if (!msg.message || msg.key.remoteJid === "status@broadcast") return

            const from = msg.key.remoteJid
            const isGroup = from.endsWith("@g.us")
            const sender = (msg.key.participant || from).split(":")[0] + "@s.whatsapp.net"
            
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
            if (!text) return
            const cmd = text.trim()
            const command = cmd.split(" ")[0].toLowerCase()

            // 1. DATABASE SYNC (Settings)
            let settings = await GroupSettings.findOne({ group: from })
            if (!settings) settings = await GroupSettings.create({ group: from })

            // 2. ADMIN & BOT CHECK (FIXED LOGIC)
            let isAdmin = false
            let botAdmin = false
            if (isGroup) {
                const meta = await sock.groupMetadata(from)
                const member = meta.participants.find(x => x.id === sender)
                const botId = sock.user.id.split(":")[0] + "@s.whatsapp.net"
                const bot = meta.participants.find(x => x.id === botId)

                isAdmin = member?.admin === 'admin' || member?.admin === 'superadmin'
                botAdmin = bot?.admin === 'admin' || bot?.admin === 'superadmin'
            }

            // 3. SESSION CHECK
            let session = isGroup ? await Session.findOne({ group: from }) : null

            // BLOCK PERINTAH JIKA BELUM LOGIN
            if (!session && command.startsWith(".") && command !== ".login") {
                return sock.sendMessage(from, { text: "❌ Admin group belum login\n\nSilahkan login:\n.login key" })
            }

            // =========================
            // COMMANDS
            // =========================

            // LOGIN
            if (command === ".login") {
                if (!isGroup) return sock.sendMessage(from, { text: "❌ Login hanya di group" })
                const inputKey = cmd.split(" ")[1]
                if (!inputKey) return sock.sendMessage(from, { text: ".login KEY-XXXX" })

                const isOwner = inputKey === OWNER_KEY
                if (!isAdmin && !isOwner) return sock.sendMessage(from, { text: "❌ Hanya admin group / Owner yang bisa login" })

                if (isOwner) {
                    await Session.findOneAndUpdate({ group: from }, {
                        group: from, admin: sender, role: "owner", key: inputKey,
                        expired: 9999999999999, loginAt: Date.now()
                    }, { upsert: true })
                    return sock.sendMessage(from, { text: "👑 OWNER LOGIN SUCCESS\n✅ Bot aktif" })
                }

                const data = await User.findOne({ key: inputKey.trim().toUpperCase() })
                if (!data || Date.now() > data.expired) return sock.sendMessage(from, { text: "❌ Key invalid / expired" })

                await Session.findOneAndUpdate({ group: from }, {
                    group: from, admin: sender, role: data.role, key: data.key,
                    expired: data.expired, loginAt: Date.now()
                }, { upsert: true })

                return sock.sendMessage(from, { 
                    text: `✅ LOGIN SUCCESS\n👮 Admin: @${sender.split("@")[0]}\n📅 Expired: ${format(data.expired)}`,
                    mentions: [sender]
                })
            }

            // REFRESH SESSION DATA
            session = isGroup ? await Session.findOne({ group: from }) : null
            if (!session && isGroup) return 

            const currentRole = session?.role || "user"

            // CHECK SESSION EXPIRED
            if (session && session.expired !== 9999999999999 && Date.now() > session.expired) {
                await Session.deleteOne({ group: from })
                return sock.sendMessage(from, { text: "❌ Session expired" })
            }

            // FILTER CHAT (AUTO DELETE)
            if (settings.filterchat.length > 0 && !isAdmin && !sender.includes(OWNER_NUMBER)) {
                const bad = settings.filterchat.find(x => text.toLowerCase().includes(x.toLowerCase()))
                if (bad) return await sock.sendMessage(from, { delete: msg.key })
            }

            // ANTILINK (AUTO KICK)
            if (settings.antilink && isGroup && isLink(text)) {
                if (isAdmin || sender.includes(OWNER_NUMBER)) return
                if (!botAdmin) return // Bot can't kick if not admin

                let warns = settings.warns || {}
                warns[sender] = (warns[sender] || 0) + 1
                settings.warns = warns
                settings.markModified('warns')
                await settings.save()

                await sock.sendMessage(from, { delete: msg.key })

                if (warns[sender] >= settings.maxwarn) {
                    await sock.sendMessage(from, { text: `🚫 @${sender.split("@")[0]} dikeluar karena spam link`, mentions: [sender] })
                    await sock.groupParticipantsUpdate(from, [sender], "remove")
                    delete warns[sender]
                    settings.warns = warns
                    settings.markModified('warns')
                    await settings.save()
                    return
                }

                return sock.sendMessage(from, { 
                    text: `⚠️ Warning ${warns[sender]}/${settings.maxwarn}\nJangan kirim link!\nSisa warning: ${settings.maxwarn - warns[sender]}`,
                    mentions: [sender]
                })
            }

            // ROLE LIMITATION
            const userLimit = [".menu", ".linkgroup", ".sticker", ".masaaktif", ".owner", ".contact", ".sewabot"]
            if (currentRole === "user" && command.startsWith(".") && !userLimit.includes(command)) {
                return sock.sendMessage(from, { text: "❌ Akses premium diperlukan untuk fitur ini" })
            }

            // MENU SYSTEM
            if (command === ".menu") {
                let menuTxt = `📌 *MENU - ROLE: ${currentRole.toUpperCase()}*\n\n`
                if (currentRole === "owner") {
                    menuTxt += `👑 *OWNER*\n.genkey .genprem .panel .addtime .delkey\n\n`
                }
                if (currentRole === "owner" || currentRole === "premium") {
                    menuTxt += `👮 *ADMIN*\n.antilink on/off\n.autokick <n>\n.filterchat add/del\n.kick\n\n`
                }
                menuTxt += `📌 *OTHERS*\n.linkgroup\n.sticker\n.masaaktif\n.owner\n.contact\n.sewabot`
                return sock.sendMessage(from, { text: menuTxt })
            }

            // GROUP COMMANDS
            if (command === ".antilink") {
                if (!isAdmin && currentRole !== "owner") return sock.sendMessage(from, { text: "❌ Khusus Admin" })
                const val = cmd.split(" ")[1]
                if (!["on", "off"].includes(val)) return sock.sendMessage(from, { text: ".antilink on/off" })
                settings.antilink = val === "on"
                await settings.save()
                return sock.sendMessage(from, { text: `✅ Antilink ${val}` })
            }

            if (command === ".kick") {
                if (!isAdmin && currentRole !== "owner") return sock.sendMessage(from, { text: "❌ Khusus Admin" })
                if (!botAdmin) return sock.sendMessage(from, { text: "❌ Bot bukan Admin" })
                
                let target = msg.message.extendedTextMessage?.contextInfo?.participant || 
                             (cmd.split(" ")[1] ? cmd.split(" ")[1].replace(/[^0-9]/g, "") + "@s.whatsapp.net" : null)
                
                if (!target) return sock.sendMessage(from, { text: "Tag atau reply member!" })
                await sock.groupParticipantsUpdate(from, [target], "remove")
                return sock.sendMessage(from, { text: "✅ Berhasil kick" })
            }

            if (command === ".linkgroup") {
                if (!botAdmin) return sock.sendMessage(from, { text: "❌ Bot bukan Admin" })
                const code = await sock.groupInviteCode(from)
                return sock.sendMessage(from, { text: "https://chat.whatsapp.com/" + code })
            }

            // OWNER & PANEL COMMANDS
            if (command === ".genkey" || command === ".genprem") {
                if (currentRole !== "owner") return
                const hari = parseInt(cmd.split(" ")[1])
                if (!hari) return sock.sendMessage(from, { text: "Contoh: .genkey 7" })
                
                const role = command === ".genkey" ? "user" : "premium"
                const keyPrefix = command === ".genkey" ? "KEY-" : "PREM-"
                const key = keyPrefix + Math.random().toString(36).slice(2, 10).toUpperCase()
                const exp = Date.now() + (hari * 86400000)

                await User.create({ key, role, expired: exp, createdAt: Date.now() })
                return sock.sendMessage(from, { text: `✅ ${role.toUpperCase()} KEY\n\n🔑 ${key}\n⏳ ${hari} Hari\n📅 ${format(exp)}` })
            }

            if (command === ".panel") {
                if (currentRole !== "owner") return
                const all = await User.find()
                let txt = "📌 *ACTIVE KEYS*\n\n"
                all.forEach((x, i) => {
                    txt += `${i + 1}. ${x.key} (${x.role})\nExp: ${format(x.expired)}\n\n`
                })
                return sock.sendMessage(from, { text: txt })
            }

            // SIMPLE COMMANDS
            if (command === ".owner" || command === ".contact") {
                return sock.sendMessage(from, { text: `📞 *CONTACT OWNER*\n\nwa.me/${OWNER_NUMBER}` })
            }
            
            if (command === ".masaaktif") {
                return sock.sendMessage(from, { text: `📅 *MASA AKTIF BOT*\n\nExpired: ${format(session.expired)}` })
            }

        } catch (e) {
            console.log("ERROR:", e)
        }
    })
}

startBot()
