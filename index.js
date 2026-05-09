const sharp = require("sharp")
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

mongoose.connect(MONGO_URI,{
  serverSelectionTimeoutMS:15000,
  socketTimeoutMS:45000
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

const XP =
mongoose.model("XP",
new mongoose.Schema({
 group:String,
 user:String,
 xp:{
  type:Number,
  default:0
 },
 level:{
  type:Number,
  default:0
 }
}))

// =========================
// EXPRESS
// =========================
const app = express()

app.get("/", (_, res) => {
  res.send("BOT ACTIVE")
})

const PORT =
  process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("Express Running:", PORT)
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
function isWhatsAppGroupLink(text="") {

  const regex =
    /(https?:\/\/)?chat\.whatsapp\.com\/[A-Za-z0-9]+/gi

  return regex.test(text)
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
async function startBot() {

  const { state, saveCreds } =
    await useMultiFileAuthState("session")

  const { version } =
    await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: P({
      level: "silent"
    }),
    auth: state,
    printQRInTerminal: false
  })

  sock.ev.on("creds.update", saveCreds)

  // =========================
  // CONNECTION
  // =========================
  sock.ev.on("connection.update", ({
    connection,
    qr,
    lastDisconnect
  }) => {

    if (qr) {
      qrcode.generate(qr, {
        small: true
      })
    }

    if (connection === "open") {
      console.log("BOT ONLINE")
    }

    if (connection === "close") {

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut

      console.log("RECONNECT:", shouldReconnect)

 if (shouldReconnect) {
   setTimeout(() => {
      startBot()
   }, 3000)
}
    }
  })

  // =========================
  // AUTO TOLAK TELPON
  // =========================
  sock.ev.on("call", async (calls) => {

    try {

      for (const call of calls) {

        if (call.status === "offer") {

          await sock.rejectCall(
            call.id,
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

      // MEMBER MASUK
      if (m.action === "add") {

        for (let p of m.participants) {

          if (fs.existsSync("./welcome.jpg")) {

            await sock.sendMessage(m.id, {
              image: fs.readFileSync("./welcome.jpg"),
              caption: `👋 Welcome @${p.split("@")[0]}`,
              mentions: [p]
            })

          } else {

            await sock.sendMessage(m.id, {
              text: `👋 Welcome @${p.split("@")[0]}`,
              mentions: [p]
            })
          }
        }
      }

      // MEMBER KELUAR
      if (m.action === "remove") {

        for (let p of m.participants) {

          await XP.deleteMany({
  group: m.id,
  user: normalize(p)
})

          if (fs.existsSync("./keluar.jpg")) {

            await sock.sendMessage(m.id, {
              image: fs.readFileSync("./keluar.jpg"),
              caption: `👋 @${p.split("@")[0]} keluar`,
              mentions: [p]
            })

          } else {

            await sock.sendMessage(m.id, {
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

   if (msg.key.id.startsWith("BAE5")) return

      if (msg.key.remoteJid === "status@broadcast")
        return

      // ABAIKAN PESAN BOT SENDIRI
      if (msg.key.fromMe) return

      const from = msg.key.remoteJid

      const isGroup =
        from.endsWith("@g.us")

      // =========================
      // AUTO READ
      // =========================
      await sock.readMessages([
        msg.key
      ])

      // =========================
      // SENDER
      // =========================
const sender =
  normalize(
    msg.key.participant || from
  )

if (
  !isGroup &&
  sender !== OWNER_NUMBER
) return
      
      // =========================
      // TEXT
      // =========================
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        ""

      if (!text) return

      const cmd = text.trim()

      const command =
        cmd.split(" ")[0].toLowerCase()

      if (isGroup && !command.startsWith(".")) {

  let data =
    await XP.findOne({
      group: from,
      user: sender
    })

  if (!data) {
    data = await XP.create({
      group: from,
      user: sender
    })
  }

  data.xp += 5

  const next =
    (data.level + 1) * 100

  if (data.xp >= next) {

    data.level++

    await sock.sendMessage(from,{
      text:
`🎉 Selamat @${sender}

Kamu naik level ${data.level}

Tingkatkan komunikasi mu untuk naik level berikutnya`,
      mentions:[
        `${sender}@s.whatsapp.net`
      ]
    })
  }

  await data.save()
}

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
// ADMIN CHECK ULTRA FIX
// =========================
let isAdmin = false
let botAdmin = false

if (isGroup) {

const meta = await sock.groupMetadata(from)

  // =========================
  // SEMUA ID USER
  // =========================
  const senderIds = []

  if (msg.key.participant) {
    senderIds.push(
      normalize(msg.key.participant)
    )
  }

  senderIds.push(
    normalize(sender)
  )

  // =========================
  // SEMUA ID BOT
  // =========================
  const botIds = []

  // ID UTAMA
  if (sock.user?.id) {

    botIds.push(
      normalize(sock.user.id)
    )
  }

  // LID BARU
  if (sock.user?.lid) {

    botIds.push(
      normalize(sock.user.lid)
    )
  }

  // TAMBAHAN JAGA2
  if (sock.user?.jid) {

    botIds.push(
      normalize(sock.user.jid)
    )
  }

  // =========================
  // DEBUG FULL
  // =========================
  console.log("===== BOT DEBUG =====")

  console.log(
    "sock.user.id:",
    sock.user?.id
  )

  console.log(
    "sock.user.lid:",
    sock.user?.lid
  )

  console.log(
    "BOT IDS:",
    botIds
  )

  console.log(
    "GROUP PARTICIPANTS:"
  )

  meta.participants.forEach((x) => {

    console.log({
      id: x.id,
      admin: x.admin,
      normalized: normalize(x.id)
    })
  })

  // =========================
  // MEMBER
  // =========================
  const member =
    meta.participants.find(x => {

      return senderIds.includes(
        normalize(x.id)
      )
    })

  // =========================
  // BOT
  // =========================
  const bot =
    meta.participants.find(x => {

      const pid =
        normalize(x.id)

      return botIds.includes(pid)
    })

  // =========================
  // CHECK ADMIN
  // =========================
  isAdmin =
    member?.admin === "admin" ||
    member?.admin === "superadmin"

  botAdmin =
    bot?.admin === "admin" ||
    bot?.admin === "superadmin"

  // =========================
  // DEBUG FINAL
  // =========================
  console.log("===== FINAL CHECK =====")

  console.log(
    "MEMBER:",
    member
  )

  console.log(
    "BOT:",
    bot
  )

  console.log(
    "isAdmin:",
    isAdmin
  )

  console.log(
    "botAdmin:",
    botAdmin
  )
}
      // =========================
      // BLOCK BELUM LOGIN
      // =========================
      if (
        !session &&
        command.startsWith(".") &&
        command !== ".login"
      ) {

        return sock.sendMessage(from, {
          text:
`❌ Admin group belum login

Silahkan login:
.login key`
        })
      }

      // =========================
      // LOGIN
      // =========================
      if (command === ".login") {

        if (!isGroup) {

          return sock.sendMessage(from, {
            text:
              "❌ Login hanya di group"
          })
        }

        const inputKey =
          cmd.split(" ")[1]

        if (!inputKey) {

          return sock.sendMessage(from, {
            text:
`.login KEY-XXXX`
          })
        }

        const isOwner =
          inputKey === OWNER_KEY

        if (!isAdmin && !isOwner) {

          return sock.sendMessage(from, {
            text:
              "❌ Hanya admin group"
          })
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

          return sock.sendMessage(from, {
            text:
`👑 OWNER LOGIN SUCCESS

✅ Bot aktif`
          })
        }

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

          return sock.sendMessage(from, {
            text:
              "❌ Key invalid / expired"
          })
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

        return sock.sendMessage(from, {
          text:
`✅ LOGIN SUCCESS

📞 Contact Owner:
wa.me/${OWNER_NUMBER}

📅 Expired:
${format(data.expired)}`,
          mentions: [`${sender}@s.whatsapp.net`]
        })
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
  session &&
  session.expired !== 9999999999999 &&
  Date.now() > session.expired
) {
  await Session.deleteOne({
    group: from
  })

  await User.deleteOne({
    key: session.key
  })

  return sock.sendMessage(from, {
    text:
`❌ KEY SUDAH EXPIRED

🔑 ${session.key}

Bot sudah nonaktif.

Silahkan hubungi owner untuk perpanjang:
wa.me/${OWNER_NUMBER}`
  }, {
    quoted: msg
  })
}

      // =========================
      // USER LIMIT
      // =========================
      const userLimit = [
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

        return sock.sendMessage(from, {
          text:
            "❌ Akses user terbatas"
        })
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

            await sock.sendMessage(from, {
              delete: msg.key
            })
          }

          return
        }
      }

// =========================
// ANTILINK FINAL PERFECT
// =========================
if (
  settings.antilink &&
  isGroup &&
  isWhatsAppGroupLink(text)
) {

  // ADMIN & OWNER BYPASS
  if (
    isAdmin ||
    sender === OWNER_NUMBER
  ) return

  // BOT HARUS ADMIN
  if (!botAdmin) return

  // JID ASLI
  const senderJid =
    msg.key.participant || from

  // =========================
  // INIT WARNS
  // =========================
if (!settings.warns[sender]) {
  settings.warns[sender] = {
    count: 0,
    last: Date.now()
  }
}

if (
  Date.now() -
  settings.warns[sender].last >
  86400000
) {
  settings.warns[sender].count = 0
}

settings.warns[sender].count++
settings.warns[sender].last =
  Date.now()

let currentWarn =
  settings.warns[sender].count

  const maxWarn =
    Number(settings.maxwarn || 3)

  // JANGAN LEWAT BATAS
  if (currentWarn > maxWarn) {
    currentWarn = maxWarn
  }

  settings.markModified("warns")
  await settings.save()

  // =========================
  // HAPUS PESAN
  // =========================
  await sock.sendMessage(from, {
    delete: msg.key
  })

  // =========================
  // SUDAH LIMIT
  // =========================
  if (currentWarn >= maxWarn) {

    // RESET DULU
    delete settings.warns[sender]

    settings.markModified("warns")

    await settings.save()

    // PESAN
    await sock.sendMessage(from, {
      text:
`⚠️ Warning ${maxWarn}/${maxWarn}

🚫 @${sender.split("@")[0]}
melewati batas warning

Member akan dikeluarkan`,
      mentions: [senderJid]
    })

    // DELAY
    await new Promise(resolve =>
      setTimeout(resolve, 1500)
    )

    const meta = await sock.groupMetadata(from)

const target = senderJid

const victim =
  meta.participants.find(
    x => normalize(x.id) === normalize(target)
  )

if (
  victim?.admin === "admin" ||
  victim?.admin === "superadmin"
){
  return sock.sendMessage(from,{
    text:"❌ Tidak bisa kick admin"
  })
}

    // KICK
await sock.groupParticipantsUpdate(
  from,
  [target],
  "remove"
)

    return
  }

  // =========================
  // BELUM LIMIT
  // =========================
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
  session &&
  session.expired !== 9999999999999 &&
  Date.now() > session.expired
) {
  await Session.deleteOne({
    group: from
  })

  await User.deleteOne({
    key: session.key
  })

  return sock.sendMessage(from, {
    text:
`❌ KEY SUDAH EXPIRED

🔑 ${session.key}

Bot sudah nonaktif.

Silahkan hubungi owner untuk perpanjang:
wa.me/${OWNER_NUMBER}`
  }, {
    quoted: msg
  })
}

        // OWNER
        if (currentRole === "owner") {

          return sock.sendMessage(from, {
            text:
`👑 OWNER MENU

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
          })
        }

        // PREMIUM
        if (currentRole === "premium") {

          return sock.sendMessage(from, {
            text:
`⭐ PREMIUM MENU

👮 GROUP
.antilink on/off
.autokick <jumlah warning>
.filterchat add <kata>
.filterchat del <kata>
.kick

📌 OTHER
.linkgroup
.sticker
.owner`
          })
        }

        // USER
        return sock.sendMessage(from, {
          text:
`📌 USER MENU

👮 GROUP
.linkgroup

📌 OTHER
.sticker
.masaaktif
.owner`
        })
      }

      // =========================
      // OWNER MENU
      // =========================
      if (command === ".owner") {

        if (currentRole === "owner")
          return

        return sock.sendMessage(from, {
          text:
`👑 OWNER MENU

.contact
.sewabot`
        })
      }

      // =========================
      // CONTACT
      // =========================
      if (command === ".contact") {

        return sock.sendMessage(from, {
          text:
`📞 CONTACT OWNER

wa.me/${OWNER_NUMBER}`
        })
      }

      // =========================
      // SEWABOT
      // =========================
      if (command === ".sewabot") {

        return sock.sendMessage(from, {
          text:
`📦 LIST SEWA BOT

⭐ USER
5K = 7 Hari
10K = 30 Hari

👑 PREMIUM
15K = 30 Hari
25K = 90 Hari

📞 ORDER:
wa.me/${OWNER_NUMBER}`
        })
      }

      // =========================
      // ANTILINK
      // =========================
      if (command === ".antilink") {

        if (
          currentRole !== "premium" &&
          currentRole !== "owner"
        ) return

        if (!isAdmin) {

          return sock.sendMessage(from, {
            text:
              "❌ Khusus admin"
          })
        }

        const value =
          cmd.split(" ")[1]

        if (
          !["on", "off"]
          .includes(value)
        ) {

          return sock.sendMessage(from, {
            text:
`.antilink on
.antilink off`
          })
        }

        settings.antilink =
          value === "on"

        await settings.save()

        return sock.sendMessage(from, {
          text:
`✅ Antilink ${value}`
        })
      }

      // =========================
      // AUTOKICK
      // =========================
      if (command === ".autokick") {

        if (
          currentRole !== "premium" &&
          currentRole !== "owner"
        ) return

        if (!isAdmin) {

          return sock.sendMessage(from, {
            text:
              "❌ Khusus admin"
          })
        }

        const jumlah =
          parseInt(
            cmd.split(" ")[1]
          )

        if (
          !jumlah ||
          jumlah < 1
        ) {

          return sock.sendMessage(from, {
            text:
`.autokick 3`
          })
        }

        settings.maxwarn =
          jumlah

        await settings.save()

        return sock.sendMessage(from, {
          text:
`✅ AutoKick:
${jumlah} warning`
        })
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

          return sock.sendMessage(from, {
            text:
              "❌ Khusus admin"
          })
        }

        const action =
          cmd.split(" ")[1]

        const word =
          cmd.split(" ")
          .slice(2)
          .join(" ")

        if (!action) {

          return sock.sendMessage(from, {
            text:
`.filterchat add kata
.filterchat del kata`
          })
        }

        // ADD
        if (action === "add") {

          if (!word) {

            return sock.sendMessage(from, {
              text:
`.filterchat add kata`
            })
          }

          if (
            !settings.filterchat
            .includes(word)
          ) {

            settings.filterchat
            .push(word)

            await settings.save()
          }

          return sock.sendMessage(from, {
            text:
`✅ Ditambahkan:
${word}`
          })
        }

        // DELETE
        if (action === "del") {

          settings.filterchat =
            settings.filterchat.filter(
              x => x !== word
            )

          await settings.save()

          return sock.sendMessage(from, {
            text:
`✅ Dihapus:
${word}`
          })
        }
      }

      // =========================
      // KICK
      // =========================
      if (command === ".kick") {

        if (
          currentRole !== "premium" &&
          currentRole !== "owner"
        ) return

        if (!isAdmin) {

          return sock.sendMessage(from, {
            text:
              "❌ Khusus admin"
          })
        }

        if (!botAdmin) {

          return sock.sendMessage(from, {
            text:
              "❌ Bot bukan admin"
          })
        }

        let target

        // reply
        if (
          msg.message
          .extendedTextMessage
          ?.contextInfo
          ?.participant
        ) {

          target =
            msg.message
            .extendedTextMessage
            .contextInfo
            .participant
        }

        // nomor
        else {

          const nomor =
            cmd.split(" ")[1]

          if (!nomor) {

            return sock.sendMessage(from, {
              text:
`.kick 628xxxx`
            })
          }

          target =
            nomor
            .replace(/[^0-9]/g, "") +
            "@s.whatsapp.net"
        }

        await sock.groupParticipantsUpdate(
          from,
          [target],
          "remove"
        )

        return sock.sendMessage(from, {
          text:
            "✅ Berhasil kick member"
        })
      }

      // =========================
      // LINK GROUP
      // =========================
if (command === ".linkgroup") {

 if (!isGroup)
  return sock.sendMessage(from,{
    text:"❌ Hanya di group"
  })

 try{
   const code =
    await sock.groupInviteCode(from)

   return sock.sendMessage(from,{
    text:"https://chat.whatsapp.com/"+code
   })
 }catch{
   return sock.sendMessage(from,{
    text:"❌ Bot harus admin"
   })
 }
}
      // =========================
      // STICKER
      // =========================
 if (command === ".sticker") {

  const quoted =
    msg.message?.extendedTextMessage
    ?.contextInfo?.quotedMessage

  const image =
    quoted?.imageMessage ||
    msg.message?.imageMessage

  if (!image) {
    return sock.sendMessage(from,{
      text:
"Reply gambar atau kirim gambar dengan caption .sticker"
    },{ quoted: msg })
  }

const target = quoted
  ? {
      key: msg.key,
      message: quoted
    }
  : msg

const buffer =
  await sock.downloadMediaMessage(
    target,
    "buffer",
    {},
    {
      logger: P({ level:"silent" })
    }
  )
   
  const webp =
    await sharp(buffer)
    .webp()
    .toBuffer()

  return sock.sendMessage(from,{
    sticker:webp
  },{ quoted: msg })
}
      // =========================
      // MASA AKTIF
      // =========================
      if (command === ".masaaktif") {

        return sock.sendMessage(from, {
          text:
`📅 MASA AKTIF BOT

Expired:
${format(session.expired)}`
        })
      }

      // =========================
      // AUTO POST
      // =========================
      if (command === ".autopost") {

 if (
   currentRole !== "premium" &&
   currentRole !== "owner"
 ) return

 const args =
   cmd.split(" ")

 const jumlah =
   parseInt(args[args.length-2])

 const jam =
   parseInt(
    args[args.length-1]
    .replace("h","")
   )

 const text =
   args.slice(1,-2).join(" ")

 let count = 0

 const id =
 setInterval(async()=>{

   count++

   await sock.sendMessage(
     from,
     { text }
   )

   if (count >= jumlah) {
     clearInterval(id)

     await sock.sendMessage(
       from,
       {
         text:
"✅ Autopost selesai"
       }
     )
   }

 }, jam * 3600000)

 autoPost[from] = id

 return sock.sendMessage(
   from,
   {
     text:"✅ Autopost dimulai"
   },
   { quoted: msg }
 )
}

      // =========================
      // STOP AUTO POST
      // =========================

      if (command === ".stopautopost") {

 if (!autoPost[from]) {
   return sock.sendMessage(from,{
     text:"❌ Tidak ada autopost aktif"
   })
 }

 clearInterval(autoPost[from])
 delete autoPost[from]

 return sock.sendMessage(from,{
   text:"✅ Autopost dihentikan"
 })
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

          return sock.sendMessage(from, {
            text:
`.genkey 7`
          })
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

        return sock.sendMessage(from, {
          text:
`✅ USER KEY

🔑 ${key}

⏳ ${hari} Hari
📅 ${format(exp)}`
        })
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

          return sock.sendMessage(from, {
            text:
`.genprem 30`
          })
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

        return sock.sendMessage(from, {
          text:
`⭐ PREMIUM KEY

🔑 ${key}

⏳ ${hari} Hari
📅 ${format(exp)}`
        })
      }

// =========================
// PANEL
// =========================
if (command === ".panel") {

  if (currentRole !== "owner") return

  const users = await User.find()
  const sessions = await Session.find()

  let txt = "📌 ACTIVE PANEL\n\n"

  for (const u of users) {

    const ses = sessions.find(
      x => x.key === u.key
    )

    let status = "⏳"

    if (Date.now() > u.expired)
      status = "❌"
    else if (ses)
      status = "✅"

    let groupName = "-"
    let groupLink = "-"

    if (ses) {
      try {
        const meta =
          await sock.groupMetadata(
            ses.group
          )

        groupName = meta.subject

        const code =
          await sock.groupInviteCode(
            ses.group
          )

        groupLink =
          "https://chat.whatsapp.com/" +
          code

      } catch {}
    }

    txt +=
`${status} ${u.key}
Role: ${u.role}
Expired: ${format(u.expired)}
Group: ${groupName}
Link: ${groupLink}

`
  }

  return sock.sendMessage(
    from,
    { text: txt },
    { quoted: msg }
  )
}

// =========================
// ADDTIME
// =========================
if (command === ".addtime") {

  if (currentRole !== "owner") {

return sock.sendMessage(
  from,
  { text:"❌ Khusus Owner" },
  { quoted: msg }
)
  }

  const key =
    cmd.split(" ")[1]

  const hari =
    parseInt(cmd.split(" ")[2])

  if (!key || !hari) {

    return sock.sendMessage(from, {
      text:
`.addtime KEY-XXXX 30`
    })
  }

  const user =
    await User.findOne({
      key: key.toUpperCase()
    })

  if (!user) {

return sock.sendMessage(
  from,
  { text:"❌ Key Tidak Ditemukan" },
  { quoted: msg }
)
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

    await sock.sendMessage(s.group, {
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

  return sock.sendMessage(from, {
    text:
`✅ Berhasil tambah masa aktif

🔑 ${user.key}

📅 Expired Baru:
${format(user.expired)}`
  })
}

// =========================
// DELTIME
// =========================
if (command === ".deltime") {

  if (currentRole !== "owner") {

    return sock.sendMessage(from, {
      text: "❌ Khusus owner"
    })
  }

  const key =
    cmd.split(" ")[1]

  const hari =
    parseInt(cmd.split(" ")[2])

  if (!key || !hari) {

    return sock.sendMessage(from, {
      text:
`.deltime KEY-XXXX 7`
    })
  }

  const user =
    await User.findOne({
      key: key.toUpperCase()
    })

  if (!user) {

    return sock.sendMessage(from, {
      text: "❌ Key tidak ditemukan"
    })
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

    await sock.sendMessage(s.group, {
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

  return sock.sendMessage(from, {
    text:
`✅ Berhasil kurangi masa aktif

📅 Expired Baru:
${format(user.expired)}`
  })
}

// =========================
// DELKEY
// =========================
if (command === ".delkey") {

  if (currentRole !== "owner") {

    return sock.sendMessage(from, {
      text: "❌ Khusus owner"
    })
  }

  const key =
    cmd.split(" ")[1]

  if (!key) {

    return sock.sendMessage(from, {
      text:
`.delkey KEY-XXXX`
    })
  }

  const user =
    await User.findOne({
      key: key.toUpperCase()
    })

  if (!user) {

    return sock.sendMessage(from, {
      text: "❌ Key tidak ditemukan"
    })
  }

  // CARI SESSION
  const sessions =
    await Session.find({
      key: user.key
    })

  // NOTIF USER
  for (const s of sessions) {

    await sock.sendMessage(s.group, {
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

  return sock.sendMessage(from, {
    text:
`✅ Key berhasil dihapus

🔑 ${user.key}`
  })
}

// =========================
// Pemberitahuan
// =========================
      if (command === ".pemberitahuan") {

  if (currentRole !== "owner")
    return

  const pesan =
    cmd.split(" ")
    .slice(1)
    .join(" ")

  if (!pesan)
    return

  const sessions =
    await Session.find()

  for (const s of sessions) {
    await sock.sendMessage(
      s.group,
      {
        text:
`📢 PEMBERITAHUAN OWNER

${pesan}`
      }
    )
  }

  return sock.sendMessage(
    from,
    {
      text:"✅ Broadcast selesai"
    },
    { quoted: msg }
  )
}

    } catch (e) {

      console.log(
        "ERROR:",
        e.message
      )
    }
  })
}

const autoPost = {}

process.on("uncaughtException", err => {
  console.log("UNCAUGHT:", err.message)
})

process.on("unhandledRejection", err => {
  console.log("PROMISE:", err)
})

startBot()
