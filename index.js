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
    .replace("@s.whatsapp.net", "")
    .replace("@lid", "")
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
      // ADMIN CHECK FIX
      // =========================
      let isAdmin = false
      let botAdmin = false

      if (isGroup) {

        const meta =
          await sock.groupMetadata(from)

        const senderId =
          normalize(sender)

        const botId =
          normalize(sock.user.id)

        const member =
          meta.participants.find(x => {

            return (
              normalize(x.id) === senderId
            )
          })

        const bot =
          meta.participants.find(x => {

            return (
              normalize(x.id) === botId
            )
          })

        isAdmin =
          member?.admin === "admin" ||
          member?.admin === "superadmin"

        botAdmin =
          bot?.admin === "admin" ||
          bot?.admin === "superadmin"

        console.log({
          sender: senderId,
          bot: botId,
          isAdmin,
          botAdmin
        })
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

👮 Admin:
@${sender}

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
        session?.expired !== 9999999999999 &&
        Date.now() > session?.expired
      ) {

        await Session.deleteOne({
          group: from
        })

        return sock.sendMessage(from, {
          text:
            "❌ Session expired"
        })
      }

      // =========================
      // USER LIMIT
      // =========================
      const userLimit = [
        ".menu",
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
      // ANTILINK FIX
      // =========================
      if (
        settings.antilink &&
        isGroup &&
        isLink(text)
      ) {

        if (
          isAdmin ||
          sender.includes(OWNER_NUMBER)
        ) return

        // BOT HARUS ADMIN
        if (!botAdmin) {

          console.log(
            "BOT BUKAN ADMIN"
          )

          return
        }

        const warns =
          settings.warns || {}

        if (!warns[sender]) {
          warns[sender] = 0
        }

        warns[sender] += 1

        settings.warns = warns

        await settings.save()

        const left =
          settings.maxwarn -
          warns[sender]

        // DELETE PESAN
        await sock.sendMessage(from, {
          delete: msg.key
        })

        // AUTO KICK
        if (
          warns[sender] >=
          settings.maxwarn
        ) {

          await sock.sendMessage(from, {
            text:
`🚫 @${sender.split("@")[0]}
dikeluarkan karena spam link`,
            mentions: [
              `${sender}@s.whatsapp.net`
            ]
          })

          await sock.groupParticipantsUpdate(
            from,
            [
              `${sender}@s.whatsapp.net`
            ],
            "remove"
          )

          delete warns[sender]

          settings.warns = warns

          await settings.save()

          return
        }

        return sock.sendMessage(from, {
          text:
`⚠️ Warning ${warns[sender]}/${settings.maxwarn}

Jangan kirim link lagi

Sisa warning: ${left}`,
          mentions: [
            `${sender}@s.whatsapp.net`
          ]
        })
      }

      // =========================
      // MENU
      // =========================
      if (command === ".menu") {

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
.autokick <jumlah>
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

.linkgroup
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

        const code =
          await sock.groupInviteCode(from)

        return sock.sendMessage(from, {
          text:
            "https://chat.whatsapp.com/" + code
        })
      }

      // =========================
      // STICKER
      // =========================
      if (command === ".sticker") {

        return sock.sendMessage(from, {
          text:
            "✅ Sticker system aktif"
        })
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

        if (currentRole !== "owner")
          return

        const all =
          await User.find()

        let txt =
          "📌 ACTIVE KEYS\n\n"

        all.forEach((x, i) => {

          txt +=
`${i + 1}. ${x.key}
Role: ${x.role}
Expired: ${format(x.expired)}

`
        })

        return sock.sendMessage(from, {
          text: txt
        })
      }

    } catch (e) {

      console.log(
        "ERROR:",
        e.message
      )
    }
  })
}

startBot()
