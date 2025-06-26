# 🧠 Deadside Killfeed + Leaderboard Bot

A fully custom Node.js bot for Deadside game servers. It reads death logs over SFTP and pushes dynamic killfeed, suicides, longshots, and leaderboard stats to Discord — fully styled and automated.

---

## ⚙️ Features

- 🔫 Real-time killfeed and suicide logs
- 💥 Longshot tracking + killstreak milestone alerts
- 📊 Leaderboards (daily, weekly, monthly, all-time)
- 📁 Persistent JSON stat tracking (kills, deaths, K/D)
- 🔁 Rotating kill/longshot/suicide phrases for variety
- 🎭 Player highlight system (GIFs, colors, emojis)
- 🧵 Discord embed queue system to avoid rate limits

---

## 🛠 Tech Stack

- Node.js
- SFTP (ssh2-sftp-client)
- Axios (for Discord webhooks)
- JSON-based data storage
- Express.js (for future webhooks/API extensions)

---

## 🎮 Example Output

> **💀 JeffBezzoss erased YouLackSkill from existence with Mosin (217m)**  
> **⚡ Killstreak! YouLackSkill is dominating!**  
> **🎯 Longshot: JeffBezzoss → Dacowmonster707 @ 312m**  

---

## 🔧 Customization

```json
{
  "JeffBezzoss": {
    "prefix": "💸ASH WAKE💸 ",
    "emoji": "💸",
    "color": "#FFD700",
    "gifUrl": "...",
    "thumbnailUrl": "..."
  }
}
