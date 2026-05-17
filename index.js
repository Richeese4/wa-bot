const NodeCache = require("node-cache")
const P = require("pino")
const qrcode = require("qrcode-terminal")
const fs = require("fs")
const express = require("express")
const mongoose = require("mongoose")
const {
  Sticker,
  StickerTypes
} = require("wa-sticker-formatter")

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadContentFromMessage
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

autokick: {
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

// =========================
// DETECT LINK
// =========================
function isLink(text = "") {

  // bersihkan text
  const clean =
    text
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")

  // hanya detect invite group WhatsApp
  return /chat\.whatsapp\.com\/[A-Za-z0-9]+/i
    .test(clean)
}

// =========================
// NORMALIZE ID
// =========================
function normalize(id = "") {

  return id
    .replace(/:\d+/g, "")
    .replace(/@s\.whatsapp\.net/g, "")
    .replace(/@lid/g, "")
    .replace(/[^0-9]/g, "")
    .trim()
}

// =========================
// START BOT
// =========================
const PAIRING_NUMBER = "6285285738987"
async function cleanExpired() {

  const expired =
    await User.find({
      expired: {
        $lt: Date.now(),
        $ne: 9999999999999
      }
    })

  for (const x of expired) {

    await Session.deleteMany({
      key: x.key
    })

    await User.deleteOne({
      key: x.key
    })
  }

  console.log(
    "AUTO CLEAN:",
    expired.length,
    "expired keys deleted"
  )
}

async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState("session")

  const { version } =
    await fetchLatestBaileysVersion()

const sock = makeWASocket({
  version,
  logger: P({ level: "silent" }),
  auth: state,
  printQRInTerminal: false,
  markOnlineOnConnect: false,
  syncFullHistory: false,

browser: [
  "Windows",
  "Chrome",
  "131.0.6778.86"
],
  
  connectTimeoutMs: 60000,
  keepAliveIntervalMs: 10000,
  msgRetryCounterCache: new NodeCache()
})

sock.ev.on(
  "creds.update",
  saveCreds
)

  async function safeSend(jid, content, options = {}) {
  try {
    await new Promise(r => setTimeout(r, 1500))
    return await sock.sendMessage(
      jid,
      content,
      options
    )
  } catch (e) {
    console.log(
      "SEND ERROR:",
      e.message
    )
  }
}

let pairingUsed = false

sock.ev.on(
  "connection.update",
  async ({ connection, lastDisconnect }) => {

    console.log("CONNECTION:", connection)

    try {
      if (
        connection === "connecting" &&
        !state.creds.registered &&
        !pairingUsed
      ) {
        pairingUsed = true

        await new Promise(r =>
          setTimeout(r, 10000)
        )

        const code =
          await sock.requestPairingCode(
            PAIRING_NUMBER
          )

        console.log(
          "PAIRING CODE:",
          code
        )
      }

    } catch (e) {
      console.log(
        "PAIR ERROR:",
        e.message
      )
    }

    if (connection === "open") {
      console.log("BOT ONLINE")
      pairingUsed = true
    }

    if (connection === "close") {
      const status =
        lastDisconnect?.error
          ?.output?.statusCode

      console.log(
        "DISCONNECTED:",
        status
      )

      if (
        status ===
        DisconnectReason.loggedOut
      ) {
        console.log(
          "SESSION LOGGED OUT"
        )
        return
      }

      setTimeout(
        () => startBot(),
        15000
      )
    }
  }
)
    
  // =========================
  // AUTO TOLAK TELPON
  // =========================
  sock.ev.on("call", async (calls) => {

    try {

      for (const call of calls) {

        if (call.status === "offer") {

console.log(
  "CALL DETECTED:",
  call.from
)

          console.log(
            "AUTO REJECT CALL:",
            call.from
          )
        }
      }

    } catch (e) {
      console.log("CALL ERROR:", e.message)
    }
  })


  // =========================
  // WELCOME / LEAVE
  // =========================
  sock.ev.on("group-participants.update", async (m) => {

    try {

      if (m.action === "add") {

        for (let p of m.participants) {

          if (fs.existsSync("./welcome.jpg")) {

            await safeSend(m.id, {
              image: fs.readFileSync("./welcome.jpg"),
              caption: `👋 Welcome @${p.split("@")[0]}`,
              mentions: [p]
            })

          } else {

            await safeSend(m.id, {
              text: `👋 Welcome @${p.split("@")[0]}`,
              mentions: [p]
            })
          }
        }
      }

      if (m.action === "remove") {

        for (let p of m.participants) {

          if (fs.existsSync("./keluar.jpg")) {

            await safeSend(m.id, {
              image: fs.readFileSync("./keluar.jpg"),
              caption: `👋 @${p.split("@")[0]} keluar`,
              mentions: [p]
            })

          } else {

            await safeSend(m.id, {
              text: `👋 @${p.split("@")[0]} keluar`,
              mentions: [p]
            })
          }
        }
      }

    } catch (e) {
      console.log(e)
    }
  })


  // =========================
  // MESSAGE
  // =========================
  sock.ev.on("messages.upsert", async ({ messages }) => {

    try {

      const msg = messages[0]

      if (!msg.message) return

      if (msg.key.remoteJid === "status@broadcast")
        return

      // ABAIKAN PESAN BOT SENDIRI
      if (msg.key.fromMe) return

      const from = msg.key.remoteJid

      const isGroup =
        from.endsWith("@g.us")

      // =========================
      // SENDER
      // =========================

      const sender =
  normalize(
    msg.key.participant || from
  )

const senderJid =
  msg.key.participant || msg.key.remoteJid

async function reply(text) {
  return sock.sendMessage(
    from,
    {
      text: text,
      mentions: [senderJid]
    },
    {
      quoted: msg
    }
  )
}

      async function getBuffer(message, type) {
  const stream =
    await downloadContentFromMessage(
      message,
      type
    )

  let buffer = Buffer.from([])

  for await (const chunk of stream) {
    buffer = Buffer.concat([
      buffer,
      chunk
    ])
  }

  return buffer
}

// =========================
// TEXT FINAL FIX
// =========================
const m =
  msg.message?.ephemeralMessage?.message ||
  msg.message?.viewOnceMessage?.message ||
  msg.message?.documentWithCaptionMessage?.message ||
  msg.message

const text =
  m?.conversation ||
  m?.extendedTextMessage?.text ||
  m?.imageMessage?.caption ||
  m?.videoMessage?.caption ||
  m?.documentMessage?.caption ||
  ""

if (!text) return

      const cmd = text.trim()

     const command =
  cmd.trim().split(/\s+/)[0].toLowerCase()

      console.log(
        "[MESSAGE]",
        sender,
        command
      )

      // =========================
      // SETTINGS
      // =========================
      let settings =
        await GroupSettings.findOne({
          group: from
        })

      if (!settings) {

        settings =
          await GroupSettings.create({
            group: from
          })
      }

      // =========================
      // SESSION
      // =========================
      let session = null

      if (isGroup) {

        session =
          await Session.findOne({
            group: from
          })
      }
      
// =========================
// ADMIN CHECK FINAL FIX
// =========================
let isAdmin = false
let botAdmin = false

if (isGroup) {
  const meta =
    await sock.groupMetadata(from)

  // cari sender
  const member =
    meta.participants.find(p => {

      const ids = [
        p.id,
        p.jid,
        p.phoneNumber
      ]
      .filter(Boolean)
      .map(x => normalize(x))

      return ids.includes(
        normalize(msg.key.participant)
      )
    })

  isAdmin =
    member?.admin === "admin" ||
    member?.admin === "superadmin"

  // cari bot
  const bot =
    meta.participants.find(p => {

      const ids = [
        p.id,
        p.jid,
        p.phoneNumber
      ]
      .filter(Boolean)
      .map(x => normalize(x))

      return ids.includes(
        normalize(sock.user.id)
      )
    })

  botAdmin =
    bot?.admin === "admin" ||
    bot?.admin === "superadmin"

  console.log("===== FINAL CHECK =====")
  console.log("BOT ID:", sock.user.id)
  console.log("MEMBER:", member)
  console.log("BOT:", bot)
  console.log("isAdmin:", isAdmin)
  console.log("botAdmin:", botAdmin)
}
      
      // =========================
      // BLOCK BELUM LOGIN
      // =========================
      if (
        !session &&
        command.startsWith(".") &&
        command !== ".login"
      ) {

        return reply(`❌ Admin group belum login

Silahkan login:
.login key`)
      }

      // =========================
      // LOGIN
      // =========================
      if (command === ".login") {

        if (!isGroup) {

          return reply("@"+sender+" ❌ Login hanya di group")
        }

        const inputKey =
          cmd.split(" ")[1]

        if (!inputKey) {

          return reply("@"+sender+" .login KEY-XXXX")
        }

        const isOwner =
          inputKey === OWNER_KEY

        if (!isAdmin && !isOwner) {

          return reply("@"+sender+"❌ Hanya admin group")
        }

        // OWNER LOGIN
        if (isOwner) {

          await Session.findOneAndUpdate(
            { group: from },
            {
              group: from,
              admin: sender,
              role: "owner",
              key: inputKey,
              expired: 9999999999999,
              loginAt: Date.now()
            },
            { upsert: true }
          )

          return reply(
`👑 OWNER LOGIN SUCCESS @${sender}

✅ Bot aktif`
)
        }

        // USER LOGIN
 // USER LOGIN
const data =
  await User.findOne({
    key: inputKey
      .trim()
      .toUpperCase()
  })

if (
  !data ||
  Date.now() > data.expired
) {
  return reply("@"+sender+" ❌ Key invalid / expired")
}

// =========================
// CEK KEY SUDAH TERPAKAI
// =========================
const usedSession =
  await Session.findOne({
    key: data.key
  })

if (
  usedSession &&
  usedSession.group !== from
) {
  let groupName = "Group lain"

  try {
    const meta =
      await sock.groupMetadata(
        usedSession.group
      )

    groupName =
      meta.subject
  } catch {}

  return reply(
`❌ KEY SUDAH TERPAKAI

🔑 ${data.key}

Sudah aktif di:
${groupName}

KEY HANYA BISA 1X PAKAI`
  )
}

        await Session.findOneAndUpdate(
          { group: from },
          {
            group: from,
            admin: sender,
            role: data.role,
            key: data.key,
            expired: data.expired,
            loginAt: Date.now()
          },
          { upsert: true }
        )

return reply(
`✅ LOGIN SUCCESS @${sender}

📞 Contact Owner:
wa.me/${OWNER_NUMBER}

📅 Expired:
${format(data.expired)}`
)
      }

      // =========================
      // REFRESH SESSION
      // =========================
      if (isGroup) {

        session =
          await Session.findOne({
            group: from
          })
      }

      if (!session) return

      // =========================
      // ROLE
      // =========================
      const currentRole =
        session?.role || "user"

// =========================
// EXPIRED
// =========================
if (
  session?.expired !== 9999999999999 &&
  Date.now() > session?.expired
) {

  // HAPUS SESSION GROUP
  await Session.deleteOne({
    group: from
  })

  // HAPUS KEY EXPIRED DARI PANEL
  await User.deleteOne({
    key: session.key
  })

  return reply(
`❌ KEY SUDAH EXPIRED @${sender}

🔑 Key:
${session.key}

📞 Silahkan perpanjang ke owner:
wa.me/${OWNER_NUMBER}`
)
  }

      // =========================
      // USER LIMIT
      // =========================
      const userLimit = [
        ".menu",
        ".kick",
        ".antilink",
        ".linkgroup",
        ".sticker",
        ".masaaktif",
        ".owner",
        ".contact",
        ".sewabot"
      ]

      if (
        currentRole === "user" &&
        command.startsWith(".") &&
        !userLimit.includes(command)
      ) {

        return reply("❌ @"+sender+" Akses Mu Terbatas")
      }

      // =========================
      // FILTER CHAT FIX
      // =========================
      if (
        settings.filterchat.length > 0 &&
        !command.startsWith(".filterchat")
      ) {

        const bad =
          settings.filterchat.find(
            x =>
              text.toLowerCase()
              .includes(x.toLowerCase())
          )

        if (bad) {

          if (botAdmin) {

            await safeSend(from, {
              delete: msg.key
            })
          }

          return
        }
      }

// =========================
// ANTILINK FINAL
// =========================
if (
  settings.antilink &&
  isGroup &&
  isLink(text)
) {

  // admin & owner bypass
  if (
    isAdmin ||
    sender.includes(OWNER_NUMBER)
  ) return

  if (!botAdmin) return

  const senderJid =
    msg.key.participant || from

  // =====================
  // HAPUS PESAN LINK
  // =====================
  await safeSend(from, {
    delete: msg.key
  })

  // =====================
  // JIKA AUTOKICK OFF
  // cuma hapus link
  // =====================
  if (!settings.autokick) {
    return sock.sendMessage(from, {
      text:
`⚠️ Link terdeteksi

Pesan berhasil dihapus`,
      mentions: [senderJid]
    })
  }

  // =====================
  // WARNING MODE
  // =====================
  if (!settings.warns) {
    settings.warns = {}
  }

  let currentWarn =
    Number(settings.warns[sender] || 0)

  const maxWarn =
    Number(settings.maxwarn || 3)

  currentWarn++

  if (currentWarn > maxWarn) {
    currentWarn = maxWarn
  }

  settings.warns[sender] =
    currentWarn

  settings.markModified("warns")
  await settings.save()

  // =====================
  // LIMIT TERCAPAI
  // =====================
  if (currentWarn >= maxWarn) {

    delete settings.warns[sender]

    settings.markModified("warns")
    await settings.save()

    await safeSend(from, {
      text:
`⚠️ Warning ${maxWarn}/${maxWarn}

🚫 @${sender}
melewati batas

Member akan dikeluarkan`,
      mentions: [senderJid]
    })

    await new Promise(r =>
      setTimeout(r, 1500)
    )

    await sock.groupParticipantsUpdate(
      from,
      [senderJid],
      "remove"
    )

    return
  }

  const left =
    maxWarn - currentWarn

  return sock.sendMessage(from, {
    text:
`⚠️ Warning ${currentWarn}/${maxWarn}

Jangan kirim link lagi

Sisa warning: ${left}`,
    mentions: [senderJid]
  })
}
      
      // =========================
      // MENU
      // =========================
      if (command === ".menu") {

      // CEK SESSION EXPIRED SAAT MENU
if (
  session?.expired !== 9999999999999 &&
  Date.now() > session?.expired
) {

  // HAPUS SESSION
  await Session.deleteOne({
    group: from
  })

  // HAPUS KEY EXPIRED
  await User.deleteOne({
    key: session.key
  })

  return reply(
`@${sender} ❌ KEY ANDA SUDAH EXPIRED

📞 Hubungi owner untuk perpanjang:
wa.me/${OWNER_NUMBER}`
)

}

        // OWNER
        if (currentRole === "owner") {

          return reply(
`HALO BOSS @${sender}
👑 OWNER MENU

🔑 KEY SYSTEM
.genkey <hari>
.genprem <hari>

🛠 PANEL
.panel
.addtime <key> <hari>
.deltime <key> <hari>
.delkey <key>

👮 GROUP
.antilink on/off
.autokick <jumlah>
.filterchat add <kata>
.filterchat del <kata>
.kick

📌 OTHER
.linkgroup
.sticker`
)

        }

        // PREMIUM
        if (currentRole === "premium") {

          return reply(
`HALLO KAK @${sender}
⭐ PREMIUM MENU

👮 GROUP
.antilink on/off
.autokick <jumlah warning>
.filterchat add <kata>
.filterchat del <kata>
.kick <member>

📌 OTHER
.linkgroup
.sticker
.owner`
)

        }

        // USER
        return reply(
`HALLO KAK @${sender}
📌 USER MENU

👮 GROUP
.linkgroup
.antilink on/off
.kick <member>

📌 OTHER
.sticker
.masaaktif
.owner`
)
      }

      // =========================
      // OWNER MENU
      // =========================
      if (command === ".owner") {

        if (currentRole === "owner")
          return

        return reply(
`HALLO KAK @${sender}
SILAHKAN JIKA INGIN BERTANYA
ATAU MENYEWA

.contact
.sewabot`
)
      }

      // =========================
      // CONTACT
      // =========================
      if (command === ".contact") {

        return reply(
`HALLO KAK @${sender}
📞 CONTACT OWNER

wa.me/${OWNER_NUMBER}`
)
      }

      // =========================
      // SEWABOT
      // =========================
      if (command === ".sewabot") {

        return reply(
`📦 LIST SEWA BOT

⭐ USER
5K = 15 Hari
7K = 20 Hari
10K = 30 Hari

👑 PREMIUM
15K = 30 Hari
25K = 90 Hari

📞 ORDER:
wa.me/${OWNER_NUMBER}`
)
      }

// ========================= 
// ANTILINK 
// ========================= 
      if (command === ".antilink") {
        
        if (!isGroup) {
          return reply("❌ Hanya bisa dipakai di group") 
        } 
        
        // semua role boleh, asal admin group
        if (!isAdmin) {
        return reply("❌ Hanya admin group") 
      } 
      
      const value = cmd.trim().split(/\s+/)[1]?.toLowerCase()
        
      if (!["on", "off"].includes(value)) {
        return reply(`
          PERINTAH SALAH ❌
        
        .antilink on 
        .antilink off`
        ) 
      } settings.antilink = value === "on"
        
      if (value === "off") {
        settings.warns = {}
        settings.markModified("warns") 
      }
      
      await settings.save()
        
      return reply(
        `✅ Antilink ${value}` 
      ) 
    }

// =========================
// AUTOKICK
// =========================
if (command === ".autokick") {

  // hanya premium & owner
  if (
    currentRole !== "premium" &&
    currentRole !== "owner"
  ) {
    return reply("❌ Fitur khusus premium/owner")
  }

  if (!isAdmin) {
    return reply("❌ @" + sender + " khusus admin")
  }

  const arg =
    cmd.split(" ")[1]?.toLowerCase()

  // OFF
if (arg === "off") {
  settings.autokick = false
  settings.warns = {}
  settings.markModified("warns")

  await settings.save()

  return reply(
`✅ AutoKick OFF

⚠️ Semua warning direset`
  )
}

  const jumlah = parseInt(arg)

  if (!jumlah || jumlah < 1) {
    return reply(
`.autokick 3
.autokick off`
    )
  }

  settings.autokick = true
  settings.maxwarn = jumlah

  await settings.save()

  return reply(
`✅ AutoKick ON
⚠️ Max warning: ${jumlah}`
  )
}
      
      // =========================
      // FILTER CHAT
      // =========================
      if (command === ".filterchat") {

        if (
          currentRole !== "premium" &&
          currentRole !== "owner"
        ) return

        if (!isAdmin) {

return reply("❌ @"+sender+" khusus admin")
        }

        const action =
          cmd.split(" ")[1]

        const word =
          cmd.split(" ")
          .slice(2)
          .join(" ")

        if (!action) {

          return reply(
`.filterchat add kata
.filterchat del kata`
)
        }

        // ADD
        if (action === "add") {

          if (!word) {

            return reply(
`.filterchat add kata`
)
          }

          if (
            !settings.filterchat
            .includes(word)
          ) {

            settings.filterchat
            .push(word)

            await settings.save()
          }

          return reply(
`✅ Ditambahkan:
${word}`
)
        }

        // DELETE
        if (action === "del") {

          settings.filterchat =
            settings.filterchat.filter(
              x => x !== word
            )

          await settings.save()

          return reply(
`✅ Dihapus:
${word}`
)
        }
      }

// =========================
// KICK FIX ALL
// =========================
if (command === ".kick") {

  if (
    currentRole !== "premium" &&
    currentRole !== "owner" &&
    currentRole !== "user"
  ) return

  if (!isAdmin) {
    return reply("❌ @" + sender + " khusus admin")
  }

  if (!botAdmin) {
    return reply("❌ Bot bukan admin")
  }

  let target = null

  // =====================
  // MODE REPLY
  // =====================
  const quoted =
    msg.message?.extendedTextMessage
      ?.contextInfo

  if (quoted?.participant) {
    target = quoted.participant
  }

  else if (quoted?.quotedParticipant) {
    target = quoted.quotedParticipant
  }

  // =====================
  // MODE TAG
  // =====================
  else if (
    msg.message?.extendedTextMessage
      ?.contextInfo?.mentionedJid?.length
  ) {
    target =
      msg.message
      .extendedTextMessage
      .contextInfo
      .mentionedJid[0]
  }

  // =====================
  // MODE NOMOR
  // =====================
  else {

    const nomor =
      cmd.split(" ")[1]

    if (!nomor) {
      return reply(
`.kick reply/tag/628xxxx`
      )
    }

    target =
      nomor.replace(/[^0-9]/g, "") +
      "@s.whatsapp.net"
  }

  console.log("TARGET KICK:", target)

await new Promise(r =>
  setTimeout(r, 2000)
)

await new Promise(r =>
  setTimeout(r, 2000)
)

await sock.groupParticipantsUpdate(
  from,
  [target],
  "remove"
)

  return reply("✅ Berhasil kick member")
}
      
      // =========================
      // LINK GROUP
      // =========================
      if (command === ".linkgroup") {

        const code =
          await sock.groupInviteCode(from)

       return reply(
            "https://chat.whatsapp.com/" + code
)
      }

// =========================
// STICKER HD
// =========================
if (command === ".sticker") {

  let imageBuffer = null

  // gambar langsung
  if (msg.message.imageMessage) {
    imageBuffer =
      await getBuffer(
        msg.message.imageMessage,
        "image"
      )
  }

  // reply gambar
  else if (
    msg.message?.extendedTextMessage
      ?.contextInfo?.quotedMessage
      ?.imageMessage
  ) {
    const quoted =
      msg.message
      .extendedTextMessage
      .contextInfo
      .quotedMessage
      .imageMessage

    imageBuffer =
      await getBuffer(
        quoted,
        "image"
      )
  }

  if (!imageBuffer) {
    return reply(
`Kirim gambar dengan caption:
.sticker

atau reply gambar lalu ketik:
.sticker`
    )
  }

  const sticker =
    new Sticker(imageBuffer, {
      pack: "By ZnoidFamz 082162625200",
      author: "ZnoidFamz",
      type: StickerTypes.FULL,
      quality: 100,
      background: "transparent"
    })

  const stickerBuffer =
    await sticker.toBuffer()

  await safeSend(
    from,
    {
      sticker: stickerBuffer
    },
    {
      quoted: msg
    }
  )

  return
}
      
      // =========================
      // MASA AKTIF
      // =========================
      if (command === ".masaaktif") {

        return reply(
`📅 MASA AKTIF BOT

Expired:
${format(session.expired)}`
)
      }

      // =========================
      // GENKEY USER
      // =========================
      if (command === ".genkey") {

        if (currentRole !== "owner")
          return

        const hari =
          parseInt(
            cmd.split(" ")[1]
          )

        if (!hari) {

          return reply(
`.genkey 7`
)
        }

        const key =
          "KEY-" +
          Math.random()
          .toString(36)
          .slice(2, 10)
          .toUpperCase()

        const exp =
          Date.now() +
          (
            hari *
            86400000
          )

        await User.create({
          key,
          role: "user",
          expired: exp,
          createdAt: Date.now()
        })

        return reply(
`✅ USER KEY

🔑 ${key}

⏳ ${hari} Hari
📅 ${format(exp)}`
)
      }

      // =========================
      // GENKEY PREMIUM
      // =========================
      if (command === ".genprem") {

        if (currentRole !== "owner")
          return

        const hari =
          parseInt(
            cmd.split(" ")[1]
          )

        if (!hari) {

          return reply(
`.genprem 30`
)
        }

        const key =
          "PREM-" +
          Math.random()
          .toString(36)
          .slice(2, 10)
          .toUpperCase()

        const exp =
          Date.now() +
          (
            hari *
            86400000
          )

        await User.create({
          key,
          role: "premium",
          expired: exp,
          createdAt: Date.now()
        })

       return reply(
`⭐ PREMIUM KEY

🔑 ${key}

⏳ ${hari} Hari
📅 ${format(exp)}`
)
      }

// =========================
// PANEL FIX TOTAL
// =========================
if (command === ".panel") {

  if (currentRole !== "owner") {
    return reply( "❌ Perintah ini khusus owner")
  }

  const users = await User.find()
  const sessions = await Session.find()

  let txt = "📌 PANEL KEY STATUS\n\n"

  if (users.length < 1) {
    txt += "Tidak ada key"
    return reply(txt)
  }

  for (const user of users) {

    // cari session berdasarkan key
const userSessions =
  sessions.filter(x => x.key === user.key)

const session =
  userSessions[0]

    let status = "🕒 Belum Redeem"
    let groupName = "-"

    // ======================
    // KEY EXPIRED
    // ======================
    if (
      user.expired !== 9999999999999 &&
      Date.now() > user.expired
    ) {

      status = "❌ Expired"

      // hapus session lama otomatis
      await Session.deleteMany({
        key: user.key
      })
    }

    // ======================
    // KEY AKTIF
    // ======================
    else if (session) {

      status = "✅ Aktif"

      try {
        const meta =
          await sock.groupMetadata(
            session.group
          )

        groupName =
          meta.subject || "Unknown Group"

      } catch {
        groupName = "Group tidak ditemukan"
      }
    }

    txt +=
`${status}

🔑 ${user.key}
👤 ${user.role}
📅 ${format(user.expired)}
👥 ${groupName}

`
  }

  return reply(txt)
}
      
// =========================
// ADDTIME
// =========================
if (command === ".addtime") {

  if (currentRole !== "owner") {

    return reply("❌ Khusus owner")
  }

  const key =
    cmd.split(" ")[1]

  const hari =
    parseInt(cmd.split(" ")[2])

  if (!key || !hari) {

return reply(
`.addtime KEY-XXXX 30`)
  }

  const user =
    await User.findOne({
      key: key.toUpperCase()
    })

  if (!user) {

    return reply("❌ Key tidak ditemukan")
  }

  // TAMBAH MASA AKTIF
  user.expired +=
    hari * 86400000

  await user.save()

  // UPDATE SESSION
  await Session.updateMany(
    {
      key: user.key
    },
    {
      expired: user.expired
    }
  )

  // NOTIF KE GROUP USER
  const sessions =
    await Session.find({
      key: user.key
    })

  for (const s of sessions) {

    await safeSend(s.group, {
      text:
`✅ MASA AKTIF DITAMBAHKAN

🔑 Key:
${user.key}

⏳ Tambahan:
${hari} Hari

📅 Expired Baru:
${format(user.expired)}

📞 Owner:
wa.me/${OWNER_NUMBER}`
    })
  }

  return reply(
`✅ Berhasil tambah masa aktif

🔑 ${user.key}

📅 Expired Baru:
${format(user.expired)}`)
}

// =========================
// DELTIME
// =========================
if (command === ".deltime") {

  if (currentRole !== "owner") {

   return reply("❌ Khusus owner")
  }

  const key =
    cmd.split(" ")[1]

  const hari =
    parseInt(cmd.split(" ")[2])

  if (!key || !hari) {

    return reply(
`.deltime KEY-XXXX 7`
)
  }

  const user =
    await User.findOne({
      key: key.toUpperCase()
    })

  if (!user) {

    return reply("❌ Key tidak ditemukan")
  }

  // KURANGI MASA AKTIF
  user.expired -=
    hari * 86400000

  await user.save()

  // UPDATE SESSION
  await Session.updateMany(
    {
      key: user.key
    },
    {
      expired: user.expired
    }
  )

  // NOTIF USER
  const sessions =
    await Session.find({
      key: user.key
    })

  for (const s of sessions) {

    await safeSend(s.group, {
      text:
`⚠️ MASA AKTIF DIKURANGI

🔑 Key:
${user.key}

⏳ Dikurangi:
${hari} Hari

📅 Expired Baru:
${format(user.expired)}

📞 Owner:
wa.me/${OWNER_NUMBER}`
    })
  }

  return reply(
`✅ Berhasil kurangi masa aktif

📅 Expired Baru:
${format(user.expired)}`
)
}

// =========================
// DELKEY
// =========================
if (command === ".delkey") {

  if (currentRole !== "owner") {

    return reply("❌ Khusus owner")
  }

  const key =
    cmd.split(" ")[1]

  if (!key) {

    return reply(
`.delkey KEY-XXXX`)
  }

  const user =
    await User.findOne({
      key: key.toUpperCase()
    })

  if (!user) {

   return reply("❌ Key tidak ditemukan")
  }

  // CARI SESSION
  const sessions =
    await Session.find({
      key: user.key
    })

  // NOTIF USER
  for (const s of sessions) {

    await safeSend(s.group, {
      text:
`❌ KEY DIHAPUS OWNER

🔑 Key:
${user.key}

Bot sudah tidak aktif

📞 Hubungi owner:
wa.me/${OWNER_NUMBER}`
    })
  }

  // HAPUS SESSION
  await Session.deleteMany({
    key: user.key
  })

  // HAPUS USER
  await User.deleteOne({
    key: user.key
  })

  return reply(
`✅ Key berhasil dihapus

🔑 ${user.key}`)
}

    } catch (e) {
      console.log(
        "ERROR:",
        e.message
      )
    }
  })
}

cleanExpired()
  .then(() => startBot())
  .catch(console.error)
