# WhatsApp Commission Bot v2

Personal WhatsApp bot powered by **Baileys**. Only responds to your own messages.

---

## Setup

### 1. Requirements

```bash
node -v   # needs Node.js 18+
```

### 2. Install

```bash
npm install
```

### 3. Configure your number

Open `bot.js` and set line 20:

```js
const MY_NUMBER = '12345678901'; // country code + number, no + or spaces
```

### 4. Run

```bash
node bot.js
```

Scan the QR code with WhatsApp → **Linked Devices → Link a Device**.

---

## Keep alive with PM2

```bash
npm install -g pm2
pm2 start bot.js --name wabot
pm2 save
pm2 startup
```

---

## Commands

### User commands
| Command | What it does |
|---|---|
| `/ping` | Check bot is alive |
| `/price` | Show pricing |
| `/payment` | Show payment QR / info |
| `/status` | Show commission slots |
| `/<any custom>` | Whatever you defined |

### Management commands
| Command | What it does |
|---|---|
| `/addcmd <n> \| <desc> \| <response>` | Create a new command |
| `/delcmd <n>` | Delete a custom command |
| `/listcmds` | List all commands |
| `/setimage <n> \| <caption>` | Attach image to a command (reply to image) |
| `/removeimage <n>` | Remove image from a command |

---

## Attaching an image to a command

1. Send the image to yourself in WhatsApp
2. **Reply** to that image with:
   ```
   /setimage payment | Scan to pay via GCash 💸
   ```
3. Done — `/payment` now sends that image with caption

You can also send an image and caption it `/setimage payment | caption` directly (no reply needed).

---

## Edit-in-place behavior

When you trigger a command, the bot tries to **edit your command message** to show the response text in-place. If that fails (message too old, or it's an image response), it sends a new message instead.

---

## File structure

```
wabot/
├── bot.js
├── package.json
├── auth/               # Auto-created — Baileys session (don't delete)
├── images/             # Images saved here automatically via /setimage
└── commands/
    ├── builtin.json    # Edit prices/payment text here
    └── custom.json     # Auto-managed by /addcmd and /delcmd
```
