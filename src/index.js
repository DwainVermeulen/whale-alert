require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Configuration
const CONFIG = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    ALERT_THRESHOLD_USD: 10000,
    CHECK_INTERVAL_MS: 30000,
    ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY,
    SOLANA_RPC: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
    BLOCKSTREAM_API: 'https://blockstream.info/api',
};

// Sample whale wallets
const WHALE_WALLETS = {
    ethereum: [
        { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', label: 'Vitalik Buterin' },
        { address: '0x28C6c06298d514Db089934071355E5743bf21d60', label: 'Binance 14' },
    ],
    bitcoin: [
        { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', label: 'Binance Cold' },
        { address: 'bc1q9vza2e8x572nk65f6s7m3dktsq4fpx9jc5hhrj', label: 'MtGox Cold' },
    ],
    solana: [
        { address: 'EPjFWdd5AufqSSCwBkCwBz8L1hKjBRQ54iTZ2EfHT3t5', label: 'USDC Circle' },
        { address: 'AG2S8mC7uCBi7YV3T1qKJBq3L4R5M6N8P9Q0R1S2T3U', label: 'Solana Foundation' },
    ]
};

// Price cache
const prices = { eth: 0, btc: 0, sol: 0 };
const seenTxHashes = new Set();

class WhaleAlertBot {
    constructor() {
        this.bot = null;
        this.chatId = null;
    }

    async init() {
        if (CONFIG.TELEGRAM_BOT_TOKEN) {
            this.bot = new TelegramBot(CONFIG.TELEGRAM_BOT_TOKEN, { polling: false });
            console.log('✅ Telegram bot initialized');
        }
        await this.fetchPrices();
    }

    async fetchPrices() {
        try {
            const [eth, btc, sol] = await Promise.all([
                axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,solana&vs_currencies=usd', { timeout: 5000 }),
            ]);
            prices.eth = eth.data?.ethereum?.usd || 2500;
            prices.btc = btc.data?.bitcoin?.usd || 45000;
            prices.sol = sol.data?.solana?.usd || 100;
            console.log(`📊 Prices: ETH $${prices.eth.toLocaleString()} | BTC $${prices.btc.toLocaleString()} | SOL $${prices.sol.toLocaleString()}`);
        } catch (e) {
            console.log('⚠️ Using default prices');
            prices.eth = 2500; prices.btc = 45000; prices.sol = 100;
        }
    }

    setChatId(chatId) { this.chatId = chatId; }

    async checkEthWallet(wallet) {
        try {
            const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${wallet.address}&startblock=0&endblock=99999999&sort=desc&apikey=${CONFIG.ETHERSCAN_API_KEY}`;
            const response = await axios.get(url, { timeout: 10000 });
            
            if (response.data.status === '1' && response.data.result.length > 0) {
                const tx = response.data.result[0];
                if (!seenTxHashes.has(tx.hash)) {
                    seenTxHashes.add(tx.hash);
                    const valueEth = parseFloat(tx.value) / 1e18;
                    const valueUsd = valueEth * prices.eth;
                    
                    if (valueUsd > CONFIG.ALERT_THRESHOLD_USD) {
                        await this.sendAlert({
                            chain: 'Ethereum',
                            label: wallet.label,
                            address: wallet.address,
                            action: '📤 Out',
                            amount: `${valueEth.toFixed(4)} ETH`,
                            usd: `$${valueUsd.toLocaleString()}`,
                            txHash: tx.hash
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`❌ ETH error ${wallet.address}:`, error.message);
        }
    }

    async checkBtcWallet(wallet) {
        try {
            const url = `${CONFIG.BLOCKSTREAM_API}/address/${wallet.address}/txs`;
            const response = await axios.get(url, { timeout: 10000 });
            
            if (response.data && response.data.length > 0) {
                const tx = response.data[0];
                if (!seenTxHashes.has(tx.txid)) {
                    seenTxHashes.add(tx.txid);
                    
                    // Calculate total output value
                    let totalSats = 0;
                    for (const out of tx.vout) {
                        totalSats += Math.floor(out.value * 1e8);
                    }
                    const valueBtc = totalSats / 1e8;
                    const valueUsd = valueBtc * prices.btc;
                    
                    if (valueUsd > CONFIG.ALERT_THRESHOLD_USD) {
                        await this.sendAlert({
                            chain: 'Bitcoin',
                            label: wallet.label,
                            address: wallet.address,
                            action: '📤 Out',
                            amount: `${valueBtc.toFixed(4)} BTC`,
                            usd: `$${valueUsd.toLocaleString()}`,
                            txHash: tx.txid
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`❌ BTC error ${wallet.address}:`, error.message);
        }
    }

    async checkSolWallet(wallet) {
        try {
            const response = await axios.post(CONFIG.SOLANA_RPC, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getSignaturesForAddress',
                params: [wallet.address, { limit: 1 }]
            }, { timeout: 10000 });
            
            if (response.data?.result?.length > 0) {
                const sig = response.data.result[0];
                if (!seenTxHashes.has(sig.signature)) {
                    seenTxHashes.add(sig.signature);
                    // For SOL, we'd need to get tx details to get amount - simplified for now
                    await this.sendAlert({
                        chain: 'Solana',
                        label: wallet.label,
                        address: wallet.address,
                        action: '📤 Activity',
                        amount: '~SOL',
                        usd: '~',
                        txHash: sig.signature
                    });
                }
            }
        } catch (error) {
            console.error(`❌ SOL error ${wallet.address}:`, error.message);
        }
    }

    async sendAlert(data) {
        const message = `
🐋 <b>Whale Alert</b>

<b>Chain:</b> ${data.chain}
<b>Wallet:</b> ${data.label}
<b>Address:</b> <code>${data.address.slice(0, 8)}...${data.address.slice(-6)}</code>
<b>Action:</b> ${data.action}
<b>Amount:</b> ${data.amount} (${data.usd})
<b>TX:</b> <code>${data.txHash?.slice(0, 12)}...</code>
        `.trim();

        console.log('\n' + '='.repeat(45));
        console.log(`🐋 WHALE ALERT - ${data.chain}`);
        console.log(`${data.label}: ${data.amount} (${data.usd})`);
        console.log('='.repeat(45) + '\n');

        if (this.bot && this.chatId) {
            try {
                await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
            } catch (error) {
                console.error('Failed to send Telegram alert:', error.message);
            }
        }
    }

    async startMonitoring() {
        console.log('\n🐋 Whale Alert Bot Started!');
        console.log(`📊 ETH: ${WHALE_WALLETS.ethereum.length} | BTC: ${WHALE_WALLETS.bitcoin.length} | SOL: ${WHALE_WALLETS.solana.length} wallets`);
        console.log(`⏱️ Check interval: ${CONFIG.CHECK_INTERVAL_MS / 1000}s\n`);

        const checkAll = async () => {
            await this.fetchPrices();
            for (const wallet of WHALE_WALLETS.ethereum) await this.checkEthWallet(wallet);
            for (const wallet of WHALE_WALLETS.bitcoin) await this.checkBtcWallet(wallet);
            for (const wallet of WHALE_WALLETS.solana) await this.checkSolWallet(wallet);
        };

        await checkAll();
        setInterval(checkAll, CONFIG.CHECK_INTERVAL_MS);
    }
}

// CLI
const args = process.argv.slice(2);
if (args[0] === 'monitor') {
    const bot = new WhaleAlertBot();
    bot.init().then(() => bot.startMonitoring());
} else if (args[0] === 'test-alert') {
    const bot = new WhaleAlertBot();
    bot.init().then(async () => {
        bot.setChatId(args[1]);
        await bot.sendAlert({
            chain: 'Ethereum',
            label: 'Test Wallet',
            address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            action: '📤 Out',
            amount: '2.5 ETH',
            usd: '$6,250',
            txHash: '0x1234567890abcdef1234567890abcdef'
        });
    });
} else {
    console.log(`🐋 Whale Alert Bot
Usage:
  node src/index.js monitor        Start monitoring
  node src/index.js test-alert <chat_id>  Test alert`);
}

module.exports = WhaleAlertBot;
