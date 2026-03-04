# Whales Alert Terminal

A retro-styled crypto whale tracking dashboard.

## Quick Start

```bash
# Install dependencies
npm install

# Run
npm start
```

## Docker

```bash
# Build
docker build -t whale-alert .

# Run
docker run -p 3000:3000 whale-alert
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |
| `ETHERSCAN_API_KEY` | Etherscan API key |
| `SOLANA_RPC` | Solana RPC URL |

## Features

- 🐋 Track whale wallets across multiple chains
- 📊 Real-time price monitoring
- 🔔 Price alerts
- 📱 Telegram notifications
- 💾 Persistent data storage
- 🖥️ 1984 terminal aesthetic UI
