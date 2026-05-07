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
    /((https?:\/\/)|(www\.)|(chat\.whatsapp\.com\/)|(wa\.me\/))/gi

  return regex.test(text)
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
    auth: state
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

      if (shouldReconnect) {
        startBot()
      }
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

          await sock.sendMessage(m.id, {
            image: fs.readFileSync("./welcome.jpg"),
            caption: `👋 Welcome @${p.split("@")[0]}`,
            mentions: [p]
          })
        }
      }

      // MEMBER KELUAR
      if (m.action === "remove") {

        for (let p of m.participants) {

          await sock.sendMessage(m.id, {
            image: fs.readFileSync("./keluar.jpg"),
            caption: `👋 @${p.split("@")[0]} keluar`,
            mentions: [p]
          })
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

      // skip status
      if (msg.key.remoteJid === "status@broadcast")
        return

      // skip bot sendiri
      if (msg.key.fromMe)
        return

      const from = msg.key.remoteJid

      const sender =
        (msg.key.participant || from)
        .split(":")[0]

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ""

      if (!text) return

      const cmd = text.trim()

      const command =
        cmd.split(" ")[0].toLowerCase()

      const isGroup =
        from.endsWith("@g.us")

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
      // ADMIN CHECK
      // =========================
      let isAdmin = false
      let botAdmin = false

      if (isGroup) {

        const meta =
          await sock.groupMetadata(from)

        const participants =
          meta.participants || []

        // USER ADMIN
        const member =
          participants.find(x =>
            x.id.split(":")[0] === sender
          )

        // BOT ADMIN
        const botId =
          sock.user.id.split(":")[0]

        const bot =
          participants.find(x =>
            x.id.split(":")[0] === botId
          )

        isAdmin =
          member?.admin === "admin" ||
          member?.admin === "superadmin"

        botAdmin =
          bot?.admin === "admin" ||
          bot?.admin === "superadmin"
      }

      // =========================
      // SESSION
      // =========================
      let session = isGroup
        ? await Session.findOne({
            group: from
          })
        : null

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
@${sender.split("@")[0]}

📅 Expired:
${format(data.expired)}`,
          mentions: [sender]
        })
      }

      // =========================
      // REFRESH SESSION
      // =========================
      session =
        await Session.findOne({
          group: from
        })

      if (!session) return

      const currentRole =
        session.role || "user"

      // =========================
      // EXPIRED
      // =========================
      if (
        session.expired !== 9999999999999 &&
        Date.now() > session.expired
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
      // FILTER CHAT DETECTOR
      // =========================
      if (
        settings.filterchat.length > 0 &&
        !text.startsWith(".filterchat")
      ) {

        const bad =
          settings.filterchat.find(x =>
            text.toLowerCase()
            .includes(x.toLowerCase())
          )

        if (bad) {

          try {

            await sock.sendMessage(from, {
              delete: msg.key
            })

          } catch {}

          // warning
          const warns =
            settings.warns || {}

          if (!warns[sender]) {
            warns[sender] = 0
          }

          warns[sender] += 1

          settings.warns = warns

          await settings.save()

          // autokick
          if (
            warns[sender] >=
            settings.maxwarn
          ) {

            if (botAdmin) {

              await sock.sendMessage(from, {
                text:
`🚫 @${sender.split("@")[0]}
dikeluarkan karena spam chat`,
                mentions: [sender]
              })

              await sock.groupParticipantsUpdate(
                from,
                [sender],
                "remove"
              )

              delete warns[sender]

              settings.warns = warns

              await settings.save()
            }
          }

          return
        }
      }

      // =========================
      // ANTILINK DETECTOR FIX
      // =========================
      if (
        settings.antilink &&
        isGroup &&
        isLink(text)
      ) {

        // admin bebas
        if (isAdmin)
          return

        // owner bebas
        if (
          sender.includes(
            OWNER_NUMBER
          )
        ) return

        // bot harus admin
        if (!botAdmin) {

          return sock.sendMessage(from, {
            text:
              "❌ Bot harus admin agar Antilink bekerja"
          })
        }

        // DELETE PESAN
        try {

          await sock.sendMessage(from, {
            delete: {
              remoteJid: from,
              fromMe: false,
              id: msg.key.id,
              participant: sender
            }
          })

        } catch (err) {

          console.log(
            "DELETE ERROR:",
            err.message
          )
        }

        // WARNING
        const warns =
          settings.warns || {}

        if (!warns[sender]) {
          warns[sender] = 0
        }

        warns[sender] += 1

        settings.warns = warns

        await settings.save()

        const totalWarn =
          warns[sender]

        const maxWarn =
          settings.maxwarn

        // AUTOKICK
        if (totalWarn >= maxWarn) {

          await sock.sendMessage(from, {
            text:
`🚫 @${sender.split("@")[0]}
dikeluarkan karena mengirim link`,
            mentions: [sender]
          })

          await sock.groupParticipantsUpdate(
            from,
            [sender],
            "remove"
          )

          delete warns[sender]

          settings.warns = warns

          await settings.save()

          return
        }

        return sock.sendMessage(from, {
          text:
`⚠️ WARNING ${totalWarn}/${maxWarn}

Jangan kirim link di group.`,
          mentions: [sender]
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

          if (!word) return

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

          if (!word) {

            return sock.sendMessage(from, {
              text:
`.filterchat del kata`
            })
          }

          const before =
            settings.filterchat.length

          settings.filterchat =
            settings.filterchat.filter(
              x =>
                x.toLowerCase() !==
                word.toLowerCase()
            )

          await settings.save()

          if (
            before ===
            settings.filterchat.length
          ) {

            return sock.sendMessage(from, {
              text:
                "❌ Kata tidak ditemukan"
            })
          }

          return sock.sendMessage(from, {
            text:
`✅ Filter dihapus:
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

    } catch (e) {

      console.log(
        "ERROR:",
        e.message
      )
    }
  })
}

startBot()
