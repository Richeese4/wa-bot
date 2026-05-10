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

// =========================
// DETECT LINK
// =========================
function isLink(text) {

  const regex =
    /(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me)/gi

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
        startBot()
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

      if (!msg.message) return

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

  const meta =
    await sock.groupMetadata(from)

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

        return reply('❌ Admin group belum login

Silahkan login:
.login key')
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

          return reply("@"+sender+"❌ Key invalid / expired")
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
  isLink(text)
) {

  // ADMIN & OWNER BYPASS
  if (
    isAdmin ||
    sender.includes(OWNER_NUMBER)
  ) return

  // BOT HARUS ADMIN
  if (!botAdmin) return

  // JID ASLI
  const senderJid =
    msg.key.participant || from

  // =========================
  // INIT WARNS
  // =========================
  if (!settings.warns) {
    settings.warns = {}
  }

  // WARNING SEKARANG
  let currentWarn =
    Number(settings.warns[sender] || 0)

  const maxWarn =
    Number(settings.maxwarn || 3)

  // TAMBAH WARNING
  currentWarn++

  // JANGAN LEWAT BATAS
  if (currentWarn > maxWarn) {
    currentWarn = maxWarn
  }

  // SAVE
  settings.warns[sender] =
    currentWarn

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

    // KICK
    await sock.groupParticipantsUpdate(
      from,
      [senderJid],
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
.kick

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
5K = 7 Hari
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

        if (
          currentRole !== "premium" &&
          currentRole !== "owner"
        ) return

        if (!isAdmin) {

return reply("❌ @"+sender+" khusus admin")
        }

        const value =
          cmd.split(" ")[1]

        if (
          !["on", "off"]
          .includes(value)
        ) {

         return reply(
`PERINTAH SALAH ❌

.antilink on
.antilink off`
)
        }

        settings.antilink =
          value === "on"

        await settings.save()

        return reply(
`✅ Antilink ${value}`
)
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

return reply("❌ @"+sender+" khusus admin")
        }

        const jumlah =
          parseInt(
            cmd.split(" ")[1]
          )

        if (
          !jumlah ||
          jumlah < 1
        ) {

         return reply(
`.autokick 3`
)
        }

        settings.maxwarn =
          jumlah

        await settings.save()

        return reply(
`✅ AutoKick:
${jumlah} warning`
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
      // KICK
      // =========================
      if (command === ".kick") {

        if (
          currentRole !== "premium" &&
          currentRole !== "owner"
        ) return

        if (!isAdmin) {

return reply("❌ @"+sender+" khusus admin")
        }

        if (!botAdmin) {

          return reply(
              "❌ Bot bukan admin"
)
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

            return reply(
`.kick 628xxxx`
)
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

        return reply(
            "✅ Berhasil kick member"
)
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
      // STICKER
      // =========================
      if (command === ".sticker") {

        return reply(
            "✅ Sticker system aktif"
)
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
    return reply( text: txt )
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

  return reply(
)
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

// =========================
// START
// =========================
cleanExpired()
  .then(() => startBot())
  .catch(console.error)
