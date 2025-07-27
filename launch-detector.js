// ClickShift Alpha Launch Detector Bot - Enhanced Version
// Real-time Solana new token detection with multi-source monitoring

const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const cheerio = require('cheerio');
const WebSocket = require('ws');
require('dotenv').config();

// Configuration
const CONFIG = {
    TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || 'YOUR_BOT_TOKEN_HERE',
    CHANNEL_ID: process.env.CHANNEL_ID || '@ClickShiftAlerts',
    
    // Detection settings
    MIN_LIQUIDITY: 5000,
    SCAN_INTERVAL: 30000,       // Check every 30 seconds
    
    // Safety thresholds
    SAFETY_THRESHOLDS: {
        HIGH: 85,
        MEDIUM: 70,
        LOW: 50
    },
    
    // Pump.fun WebSocket
    PUMP_WS_URL: 'wss://pump-fun-api.up.railway.app/websocket',
    
    // Helius API for real-time monitoring (optional but recommended)
    HELIUS_API_KEY: process.env.HELIUS_API_KEY || ''
};

// Initialize Telegram Bot
const bot = new TelegramBot(CONFIG.TELEGRAM_TOKEN, { polling: true });

// Track processed tokens to avoid duplicates
const processedTokens = new Set();
const recentAlerts = new Map(); // Track alert times to prevent spam

// Enhanced Launch Detection Class
class LaunchDetector {
    constructor() {
        this.isRunning = false;
        this.detectionCount = 0;
        this.startTime = Date.now();
        this.websockets = new Map();
        this.stats = {
            scans: 0,
            pump: 0,
            dexscreener: 0,
            websocket: 0,
            errors: 0
        };
    }

    // Enhanced start with multi-source monitoring
    async start() {
        console.log('🚀 ClickShift Alpha Launch Detector Starting...');
        console.log(`📡 Multi-source monitoring enabled`);
        console.log(`💧 Minimum liquidity: $${CONFIG.MIN_LIQUIDITY.toLocaleString()}`);
        console.log(`🎯 Channel: ${CONFIG.CHANNEL_ID}`);
        
        await this.sendStartupAlert();
        
        this.isRunning = true;
        
        // Start WebSocket connections for real-time data
        this.connectToPumpFunWebSocket();
        
        // Start regular scanning
        this.detectLoop();
        
        // Optional: Connect to Helius for ultra-fast detection
        if (CONFIG.HELIUS_API_KEY) {
            this.connectToHelius();
        }
    }

    // Send startup alert
    async sendStartupAlert() {
        const message = `🚀 *CLICKSHIFT ALPHA LAUNCH DETECTOR V2*

*Status:* Online ✅
*Mode:* Multi-Source Real-Time Detection

*Active Monitors:*
• Pump.fun WebSocket ⚡
• DexScreener API 📊
• Direct Web Scraping 🕸️
${CONFIG.HELIUS_API_KEY ? '• Helius RPC Stream 🔥' : ''}

*Features:*
✅ Sub-30 second detection
✅ Scam filtering algorithm
✅ Safety scoring system
✅ Market cap tracking

🔍 *Scanning for fresh launches...*

💎 *Get ready for exclusive alpha!*`;

        try {
            await bot.sendMessage(CONFIG.CHANNEL_ID, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
            console.log('✅ Startup alert sent');
        } catch (error) {
            console.error('❌ Failed to send startup alert:', error.message);
        }
    }

    // Connect to Pump.fun WebSocket for real-time updates
    connectToPumpFunWebSocket() {
        try {
            console.log('🔌 Connecting to Pump.fun WebSocket...');
            
            const ws = new WebSocket(CONFIG.PUMP_WS_URL);
            
            ws.on('open', () => {
                console.log('✅ Connected to Pump.fun WebSocket');
                
                // Subscribe to new token events
                ws.send(JSON.stringify({
                    type: 'subscribe',
                    channel: 'new_tokens'
                }));
            });
            
            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data);
                    
                    if (message.type === 'new_token' && message.token) {
                        console.log('⚡ New token from WebSocket:', message.token.symbol);
                        await this.processWebSocketToken(message.token, 'Pump.fun WebSocket');
                        this.stats.websocket++;
                    }
                } catch (error) {
                    console.error('WebSocket message error:', error);
                }
            });
            
            ws.on('error', (error) => {
                console.error('WebSocket error:', error.message);
            });
            
            ws.on('close', () => {
                console.log('WebSocket closed, reconnecting in 5s...');
                setTimeout(() => this.connectToPumpFunWebSocket(), 5000);
            });
            
            this.websockets.set('pumpfun', ws);
            
        } catch (error) {
            console.error('Failed to connect to Pump.fun WebSocket:', error);
        }
    }

    // Connect to Helius for ultra-fast detection
    async connectToHelius() {
        if (!CONFIG.HELIUS_API_KEY) return;
        
        try {
            const wsUrl = `wss://api.helius.xyz/v0/ws?api-key=${CONFIG.HELIUS_API_KEY}`;
            const ws = new WebSocket(wsUrl);
            
            ws.on('open', () => {
                console.log('✅ Connected to Helius WebSocket');
                
                // Subscribe to Raydium AMM program
                ws.send(JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'programSubscribe',
                    params: [
                        '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
                        {
                            encoding: 'jsonParsed',
                            commitment: 'confirmed',
                            filters: [
                                {
                                    memcmp: {
                                        offset: 0,
                                        bytes: '1' // New pool instruction
                                    }
                                }
                            ]
                        }
                    ]
                }));
            });
            
            ws.on('message', async (data) => {
                const message = JSON.parse(data);
                if (message.method === 'programNotification') {
                    await this.processHeliusUpdate(message.params.result);
                }
            });
            
            this.websockets.set('helius', ws);
            
        } catch (error) {
            console.error('Helius connection error:', error);
        }
    }

    // Process WebSocket token
    async processWebSocketToken(tokenData, source) {
        const tokenAddress = tokenData.mint || tokenData.address;
        
        if (!tokenAddress || processedTokens.has(tokenAddress)) {
            return;
        }
        
        // Get full token data from DexScreener
        const fullData = await this.getTokenData(tokenAddress);
        if (!fullData) {
            // If no DexScreener data yet, send early alert
            await this.sendEarlyAlert(tokenData, source);
            processedTokens.add(tokenAddress);
            return;
        }
        
        await this.analyzeNewToken(tokenAddress, source + ' ⚡', fullData);
    }

    // Send early alert for brand new tokens
    async sendEarlyAlert(tokenData, source) {
        const message = `⚡ *ULTRA-EARLY TOKEN DETECTED*

*Token:* ${tokenData.symbol || 'Unknown'} (${tokenData.name || 'New Token'})
*Contract:* \`${tokenData.mint || tokenData.address}\`
*Source:* ${source}
*Status:* Just created! No DEX data yet

🔥 *EXTREME EARLY - HIGHEST RISK*
• Detected within seconds of creation
• No liquidity data available yet
• Could be the next 1000x or a rug

⏰ *Check back in 5-10 minutes for full analysis*

🔗 [Analyze on ClickShift](https://clickshift-alpha.vercel.app)

💎 *This is as early as it gets!*`;

        try {
            await bot.sendMessage(CONFIG.CHANNEL_ID, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
            this.detectionCount++;
        } catch (error) {
            console.error('Failed to send early alert:', error);
        }
    }

    // Main detection loop
    async detectLoop() {
        while (this.isRunning) {
            try {
                this.stats.scans++;
                console.log(`\n🔍 Scan #${this.stats.scans} at ${new Date().toLocaleTimeString()}`);
                
                // Run all detection methods in parallel
                await Promise.all([
                    this.scanPumpFunAPI(),
                    this.checkDexScreenerUltraFresh(),
                    this.checkBirdeyeNewPairs()
                ]);
                
                // Show stats
                console.log(`📊 Stats - Pump: ${this.stats.pump}, DexScreener: ${this.stats.dexscreener}, WebSocket: ${this.stats.websocket}`);
                
                await this.sleep(CONFIG.SCAN_INTERVAL);
                
            } catch (error) {
                console.error('❌ Detection loop error:', error.message);
                this.stats.errors++;
                await this.sleep(10000);
            }
        }
    }

    // Scan Pump.fun API directly
    async scanPumpFunAPI() {
        try {
            console.log('🎯 Checking Pump.fun API...');
            
            // Try multiple endpoints
            const endpoints = [
                'https://pump.fun/api/recent-trades',
                'https://pump.fun/api/new-coins',
                'https://api.pump.fun/coins/latest'
            ];
            
            for (const endpoint of endpoints) {
                try {
                    const response = await axios.get(endpoint, {
                        timeout: 10000,
                        headers: {
                            'Accept': 'application/json',
                            'User-Agent': 'Mozilla/5.0'
                        }
                    });
                    
                    if (response.data && Array.isArray(response.data)) {
                        const newTokens = response.data.slice(0, 5);
                        console.log(`✅ Pump.fun: Found ${newTokens.length} recent tokens`);
                        
                        for (const token of newTokens) {
                            if (token.mint && !processedTokens.has(token.mint)) {
                                await this.analyzeNewToken(token.mint, 'Pump.fun API', token);
                                this.stats.pump++;
                            }
                        }
                        break; // If successful, don't try other endpoints
                    }
                } catch (error) {
                    // Try next endpoint
                }
            }
            
        } catch (error) {
            console.log('⚠️ Pump.fun API check failed:', error.message);
        }
    }

    // Check Birdeye for new pairs
    async checkBirdeyeNewPairs() {
        try {
            console.log('🦅 Checking Birdeye...');
            
            const response = await axios.get('https://api.birdeye.so/public/new_pairs', {
                params: {
                    chain: 'solana',
                    sort_by: 'created',
                    sort_type: 'desc',
                    limit: 10
                },
                timeout: 10000
            });
            
            if (response.data && response.data.data) {
                const pairs = response.data.data;
                const freshPairs = pairs.filter(pair => {
                    const age = Date.now() - (pair.created_at * 1000);
                    return age < 1800000; // 30 minutes
                });
                
                console.log(`✅ Birdeye: ${freshPairs.length} fresh pairs`);
                
                for (const pair of freshPairs) {
                    if (pair.address && !processedTokens.has(pair.address)) {
                        await this.analyzeNewToken(pair.address, 'Birdeye', pair);
                    }
                }
            }
            
        } catch (error) {
            console.log('⚠️ Birdeye check failed:', error.message);
        }
    }

    // Ultra-fresh DexScreener check
    async checkDexScreenerUltraFresh() {
        try {
            console.log('📊 Checking DexScreener ultra-fresh...');
            
            const response = await axios.get('https://api.dexscreener.com/latest/dex/pairs/solana', {
                params: { page: 1 },
                timeout: 10000
            });
            
            const pairs = response.data.pairs || [];
            
            // Filter for ULTRA fresh only (< 15 minutes)
            const ultraFresh = pairs.filter(pair => {
                if (!pair.pairCreatedAt) return false;
                const age = Date.now() - new Date(pair.pairCreatedAt).getTime();
                return age < 900000 && pair.liquidity?.usd > CONFIG.MIN_LIQUIDITY;
            });
            
            console.log(`✅ DexScreener: ${ultraFresh.length} ultra-fresh pairs (<15min)`);
            
            for (const pair of ultraFresh.slice(0, 3)) {
                if (pair.baseToken?.address && !processedTokens.has(pair.baseToken.address)) {
                    await this.analyzeNewToken(pair.baseToken.address, 'DexScreener Fresh', pair);
                    this.stats.dexscreener++;
                }
            }
            
        } catch (error) {
            console.log('⚠️ DexScreener check failed:', error.message);
        }
    }

    // Get comprehensive token data
    async getTokenData(tokenAddress) {
        try {
            const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
                timeout: 10000
            });
            
            const pairs = response.data.pairs;
            if (!pairs || pairs.length === 0) return null;

            const mainPair = pairs.reduce((prev, current) => 
                (current.liquidity?.usd || 0) > (prev.liquidity?.usd || 0) ? current : prev
            );

            return {
                address: tokenAddress,
                symbol: mainPair.baseToken.symbol,
                name: mainPair.baseToken.name,
                price: parseFloat(mainPair.priceUsd || 0),
                liquidity: mainPair.liquidity?.usd || 0,
                marketCap: mainPair.marketCap || 0,
                volume24h: mainPair.volume?.h24 || 0,
                priceChange5m: mainPair.priceChange?.m5 || 0,
                priceChange1h: mainPair.priceChange?.h1 || 0,
                pairAddress: mainPair.pairAddress,
                dex: mainPair.dexId,
                createdAt: mainPair.pairCreatedAt,
                buys: mainPair.txns?.h24?.buys || 0,
                sells: mainPair.txns?.h24?.sells || 0
            };
        } catch (error) {
            return null;
        }
    }

    // Analyze new token
    async analyzeNewToken(tokenAddress, source, rawData = null) {
        try {
            // Prevent duplicate alerts within 30 minutes
            const lastAlert = recentAlerts.get(tokenAddress);
            if (lastAlert && (Date.now() - lastAlert) < 1800000) {
                return;
            }

            const tokenData = await this.getTokenData(tokenAddress) || rawData;
            if (!tokenData) return;

            // Apply filters
            if (!this.passesFilters(tokenData)) {
                processedTokens.add(tokenAddress);
                return;
            }

            // Enhanced safety analysis
            const safetyScore = await this.analyzeSafety(tokenData);
            
            // Send alert
            await this.sendLaunchAlert(tokenData, safetyScore, source);
            
            processedTokens.add(tokenAddress);
            recentAlerts.set(tokenAddress, Date.now());
            this.detectionCount++;
            
            console.log(`✅ Alert sent for ${tokenData.symbol}`);
            
        } catch (error) {
            console.error(`Error analyzing token:`, error.message);
        }
    }

    // Enhanced filters
    passesFilters(tokenData) {
        if (tokenData.liquidity < CONFIG.MIN_LIQUIDITY) return false;
        if (!tokenData.price || tokenData.price <= 0) return false;
        if (!tokenData.symbol || tokenData.symbol.length < 2) return false;
        
        // Additional quality filters
        if (tokenData.symbol.length > 10) return false; // Likely scam
        if (tokenData.marketCap && tokenData.marketCap > 10000000) return false; // Too big, not new
        
        return true;
    }

    // Enhanced safety analysis
    async analyzeSafety(tokenData) {
        let score = 60; // Start neutral
        const risks = [];
        const positives = [];

        // Liquidity analysis
        if (tokenData.liquidity >= 50000) {
            score += 20;
            positives.push('Strong liquidity');
        } else if (tokenData.liquidity >= 20000) {
            score += 10;
            positives.push('Good liquidity');
        } else {
            score -= 15;
            risks.push('Low liquidity');
        }

        // Buy/Sell ratio
        if (tokenData.buys && tokenData.sells) {
            const ratio = tokenData.buys / (tokenData.sells || 1);
            if (ratio > 2) {
                score += 15;
                positives.push('Strong buy pressure');
            } else if (ratio < 0.5) {
                score -= 20;
                risks.push('Heavy selling');
            }
        }

        // Price action
        if (tokenData.priceChange5m > 50) {
            score -= 10;
            risks.push('Extreme volatility');
        } else if (tokenData.priceChange5m > 10) {
            score += 10;
            positives.push('Positive momentum');
        }

        // Age check
        const age = Date.now() - new Date(tokenData.createdAt).getTime();
        if (age < 900000) { // < 15 minutes
            score -= 20;
            risks.push('Very new (<15min)');
        } else if (age < 3600000) { // < 1 hour
            score -= 10;
            risks.push('New token (<1hr)');
        }

        return {
            score: Math.max(0, Math.min(100, score)),
            risks: risks,
            positives: positives,
            level: this.getSafetyLevel(score)
        };
    }

    // Get safety level
    getSafetyLevel(score) {
        if (score >= CONFIG.SAFETY_THRESHOLDS.HIGH) return 'HIGH';
        if (score >= CONFIG.SAFETY_THRESHOLDS.MEDIUM) return 'MEDIUM';
        if (score >= CONFIG.SAFETY_THRESHOLDS.LOW) return 'LOW';
        return 'VERY LOW';
    }

    // Send enhanced launch alert
    async sendLaunchAlert(tokenData, safetyScore, source) {
        const emoji = this.getSafetyEmoji(safetyScore.level);
        const age = this.getTimeAgo(tokenData.createdAt);
        const clickshiftUrl = `https://clickshift-alpha.vercel.app/?token=${tokenData.address}`;
        
        // Momentum indicator
        const momentum = tokenData.priceChange5m > 20 ? '🔥 HOT' : 
                        tokenData.priceChange5m > 10 ? '📈 Rising' : 
                        tokenData.priceChange5m < -10 ? '📉 Falling' : '➡️ Stable';

        const message = `🚀 *NEW LAUNCH DETECTED*

*Token:* ${tokenData.symbol} - ${tokenData.name}
*Contract:* \`${tokenData.address}\`
*Age:* ${age} | *Source:* ${source}

💰 *Market Data:*
• *Price:* $${tokenData.price.toFixed(8)}
• *Market Cap:* $${(tokenData.marketCap || 0).toLocaleString()}
• *Liquidity:* $${tokenData.liquidity.toLocaleString()}
• *5m Change:* ${tokenData.priceChange5m > 0 ? '+' : ''}${tokenData.priceChange5m.toFixed(1)}% ${momentum}
• *24h Volume:* $${(tokenData.volume24h || 0).toLocaleString()}

${emoji} *Safety Score:* ${safetyScore.score}/100 (${safetyScore.level})
${safetyScore.positives.length > 0 ? `✅ ${safetyScore.positives.join(', ')}` : ''}
${safetyScore.risks.length > 0 ? `⚠️ ${safetyScore.risks.join(', ')}` : ''}

📊 *Quick Actions:*
• [Full Analysis on ClickShift](${clickshiftUrl})
• [View Chart](https://dexscreener.com/solana/${tokenData.pairAddress || tokenData.address})
• [Trade on ${tokenData.dex || 'DEX'}](https://dexscreener.com/solana/${tokenData.pairAddress})

💎 *ClickShift Alpha - Your Edge in DeFi*`;

        try {
            await bot.sendMessage(CONFIG.CHANNEL_ID, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
        } catch (error) {
            console.error('Failed to send alert:', error);
        }
    }

    // Helper functions
    getSafetyEmoji(level) {
        return {
            'HIGH': '🟢',
            'MEDIUM': '🟡', 
            'LOW': '🟠',
            'VERY LOW': '🔴'
        }[level] || '⚫';
    }

    getTimeAgo(timestamp) {
        const now = Date.now();
        const time = new Date(timestamp).getTime();
        const diff = now - time;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    stop() {
        this.isRunning = false;
        this.websockets.forEach(ws => ws.close());
        console.log('🛑 Detector stopped');
    }
}

// Telegram command handler
bot.onText(/\/stats/, async (msg) => {
    const stats = `📊 *ClickShift Alpha Stats*

🚀 *Launches Detected:* ${detector.detectionCount}
📡 *Total Scans:* ${detector.stats.scans}
🎯 *By Source:*
• Pump.fun: ${detector.stats.pump}
• DexScreener: ${detector.stats.dexscreener}
• WebSocket: ${detector.stats.websocket}
❌ *Errors:* ${detector.stats.errors}

⏰ *Uptime:* ${Math.floor((Date.now() - detector.startTime) / 60000)} minutes

💎 *Join ClickShift Alpha!*`;

    bot.sendMessage(msg.chat.id, stats, { parse_mode: 'Markdown' });
});

bot.onText(/\/start/, (msg) => {
    const welcome = `🚀 *Welcome to ClickShift Alpha!*

Get real-time alerts for new Solana token launches with safety analysis.

📊 Visit: https://clickshift-alpha.vercel.app
📢 Channel: @ClickShiftAlerts

Commands:
/stats - View bot statistics
/help - Show help`;

    bot.sendMessage(msg.chat.id, welcome, { parse_mode: 'Markdown' });
});

// Create detector instance
const detector = new LaunchDetector();

// Start the bot
if (require.main === module) {
    detector.start().catch(console.error);
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        detector.stop();
        process.exit(0);
    });
}

module.exports = { LaunchDetector };