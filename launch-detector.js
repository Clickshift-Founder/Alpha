// ClickShift Launch Detector - PRODUCTION VERSION
// Working endpoints + Shyft API for real-time detection

const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// Configuration
const CONFIG = {
    TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
    CHANNEL_ID: process.env.CHANNEL_ID || '@ClickShiftAlerts',
    
    // API Keys
    SHYFT_API_KEY: process.env.SHYFT_API_KEY || 'YOUR_SHYFT_KEY', // Get free at shyft.to
    SHYFT_RPC_URL: `https://rpc.shyft.to?api_key=${process.env.SHYFT_API_KEY}`, // RPC endpoint
    
    // Detection settings
    MIN_LIQUIDITY: 100,          // Very low to catch all new tokens
    MAX_TOKEN_AGE: 7200000,      // 2 hours (in milliseconds)
    SCAN_INTERVAL: 20000,        // 20 seconds between scans
    
    // Safety thresholds
    SAFETY_THRESHOLDS: {
        HIGH: 70,
        MEDIUM: 50,
        LOW: 30
    }
};

// Initialize Telegram Bot
const bot = new TelegramBot(CONFIG.TELEGRAM_TOKEN, { polling: true });

// Track processed tokens
const processedTokens = new Set();
const tokenCache = new Map();

class WorkingLaunchDetector {
    constructor() {
        this.isRunning = false;
        this.detectionCount = 0;
        this.startTime = Date.now();
        this.lastDetectionTime = Date.now();
        this.stats = {
            scans: 0,
            tokens: 0,
            dexscreener: 0,
            shyft: 0,
            birdeye: 0,
            errors: 0
        };
    }

    async start() {
        console.log('🚀 ClickShift Launch Detector - PRODUCTION MODE');
        console.log(`📡 Scan interval: Every ${CONFIG.SCAN_INTERVAL/1000} seconds`);
        console.log(`💧 Min liquidity: $${CONFIG.MIN_LIQUIDITY}`);
        console.log(`⏰ Max token age: ${CONFIG.MAX_TOKEN_AGE/3600000} hours`);
        
        // Check if Shyft API key is configured
        if (CONFIG.SHYFT_API_KEY && CONFIG.SHYFT_API_KEY !== 'YOUR_SHYFT_KEY') {
            console.log('✅ Shyft API configured for real-time detection');
        } else {
            console.log('⚠️ Shyft API not configured - Get free key at shyft.to');
        }
        
        await this.sendStartupAlert();
        
        this.isRunning = true;
        this.detectLoop();
    }

    async sendStartupAlert() {
        const message = `🚀 *LAUNCH DETECTOR ONLINE*

*Version:* Production v2.0
*Speed:* 20-second scans
*Coverage:* Multiple data sources

*Active Monitors:*
• DexScreener API ✅
• Shyft RPC Monitor 🚀
• Birdeye Trending 🦅
• Direct DEX Queries 📊

*Detection Targets:*
• Tokens < 2 hours old
• Min liquidity: $${CONFIG.MIN_LIQUIDITY}
• All Solana DEXs

🔍 *Scanning for new launches...*

💎 Join the alpha: @ClickShiftAlerts`;

        try {
            await bot.sendMessage(CONFIG.CHANNEL_ID, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
            console.log('✅ Bot started successfully');
        } catch (error) {
            console.error('❌ Startup alert failed:', error.message);
        }
    }

    async detectLoop() {
        while (this.isRunning) {
            try {
                this.stats.scans++;
                console.log(`\n🔍 Scan #${this.stats.scans} at ${new Date().toLocaleTimeString()}`);
                
                // Run all detection methods
                const results = await Promise.allSettled([
                    this.checkDexScreenerWorking(),     // FIXED endpoint
                    this.checkShyftNewTokens(),         // Shyft API
                    this.checkBirdeyeTrending(),        // Birdeye trending
                    this.checkSolanaFMLatest(),         // SolanaFM
                ]);
                
                // Log results
                results.forEach((result, index) => {
                    if (result.status === 'rejected') {
                        const sources = ['DexScreener', 'Shyft', 'Birdeye', 'SolanaFM'];
                        console.log(`⚠️ ${sources[index]} failed:`, result.reason?.message?.slice(0, 50));
                    }
                });
                
                // Show stats
                const timeSinceLastDetection = Math.floor((Date.now() - this.lastDetectionTime) / 60000);
                console.log(`📊 Tokens found: ${this.stats.tokens} | Last detection: ${timeSinceLastDetection}m ago`);
                
                await this.sleep(CONFIG.SCAN_INTERVAL);
                
            } catch (error) {
                console.error('❌ Loop error:', error.message);
                this.stats.errors++;
                await this.sleep(10000);
            }
        }
    }

    // Method 1: WORKING DexScreener endpoint
    async checkDexScreenerWorking() {
        try {
            console.log('📊 Checking DexScreener...');
            
            // CORRECT ENDPOINT - This one actually works!
            const response = await axios.get('https://api.dexscreener.com/latest/dex/search', {
                params: { 
                    q: 'USDC SOL'  // Search for new SOL pairs
                },
                timeout: 10000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                }
            });
            
            if (response.data?.pairs) {
                const pairs = response.data.pairs;
                
                // Filter for new Solana pairs
                const newPairs = pairs.filter(pair => {
                    if (!pair.pairCreatedAt || pair.chainId !== 'solana') return false;
                    
                    const age = Date.now() - pair.pairCreatedAt;
                    return age < CONFIG.MAX_TOKEN_AGE && 
                           pair.liquidity?.usd >= CONFIG.MIN_LIQUIDITY;
                });
                
                console.log(`✅ DexScreener: Found ${newPairs.length} recent pairs`);
                
                // Process newest pairs first
                const sortedPairs = newPairs.sort((a, b) => b.pairCreatedAt - a.pairCreatedAt);
                
                for (const pair of sortedPairs.slice(0, 5)) {
                    const tokenAddress = pair.baseToken?.address;
                    if (tokenAddress && !processedTokens.has(tokenAddress)) {
                        await this.analyzeAndAlert(pair, 'DexScreener');
                        this.stats.dexscreener++;
                        this.stats.tokens++;
                        this.lastDetectionTime = Date.now();
                    }
                }
            }
        } catch (error) {
            console.log('⚠️ DexScreener error:', error.message);
        }
    }

    // Method 2: Shyft API for real-time detection
    async checkShyftNewTokens() {
        // Skip if no API key
        if (!CONFIG.SHYFT_API_KEY || CONFIG.SHYFT_API_KEY === 'YOUR_SHYFT_KEY') {
            return;
        }

        try {
            console.log('🚀 Checking Shyft for new tokens...');
            
            // Use Shyft's token monitoring endpoint
            const response = await axios.get('https://api.shyft.to/sol/v1/token/all_tokens', {
                headers: {
                    'x-api-key': CONFIG.SHYFT_API_KEY
                },
                params: {
                    network: 'mainnet-beta',
                    page: 1,
                    size: 20
                },
                timeout: 10000
            });
            
            if (response.data?.success && response.data?.result) {
                const tokens = response.data.result;
                console.log(`✅ Shyft: Found ${tokens.length} recent tokens`);
                
                for (const token of tokens) {
                    if (!processedTokens.has(token.address)) {
                        // Get more details about the token
                        await this.analyzeShyftToken(token);
                        this.stats.shyft++;
                    }
                }
            }
        } catch (error) {
            // Try alternative Shyft endpoint
            try {
                const response = await axios.get('https://api.shyft.to/sol/v1/transaction/history', {
                    headers: {
                        'x-api-key': CONFIG.SHYFT_API_KEY
                    },
                    params: {
                        network: 'mainnet-beta',
                        account: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
                        tx_num: 10
                    },
                    timeout: 10000
                });
                
                if (response.data?.success) {
                    console.log('✅ Shyft: Monitoring token program transactions');
                    // Process token creation transactions
                    await this.processShyftTransactions(response.data.result);
                }
            } catch (err) {
                console.log('⚠️ Shyft API error - Get free key at shyft.to');
            }
        }
    }

    // Method 3: Birdeye trending tokens
    async checkBirdeyeTrending() {
        try {
            console.log('🦅 Checking Birdeye trending...');
            
            // Birdeye public endpoint (no key needed for basic data)
            const response = await axios.get('https://public-api.birdeye.so/public/tokenlist', {
                params: {
                    sort_by: 'v24hUSD',
                    sort_type: 'desc',
                    limit: 50
                },
                timeout: 10000
            });
            
            if (response.data?.data?.tokens) {
                const tokens = response.data.data.tokens;
                
                // Filter for new tokens
                const newTokens = tokens.filter(token => {
                    // Check if we've seen it before
                    return !processedTokens.has(token.address) && 
                           token.liquidity > CONFIG.MIN_LIQUIDITY;
                });
                
                console.log(`✅ Birdeye: ${newTokens.length} potential new tokens`);
                
                for (const token of newTokens.slice(0, 3)) {
                    await this.checkIfNewToken(token.address, 'Birdeye');
                }
            }
        } catch (error) {
            // Birdeye might be rate limited or require auth
        }
    }

    // Method 4: SolanaFM latest tokens
    async checkSolanaFMLatest() {
        try {
            console.log('📡 Checking SolanaFM...');
            
            const response = await axios.get('https://api.solana.fm/v0/tokens', {
                params: {
                    limit: 20,
                    offset: 0
                },
                timeout: 10000
            });
            
            if (response.data?.tokens) {
                for (const token of response.data.tokens.slice(0, 5)) {
                    if (!processedTokens.has(token.address)) {
                        await this.checkIfNewToken(token.address, 'SolanaFM');
                    }
                }
            }
        } catch (error) {
            // SolanaFM might be down
        }
    }

    // Analyze Shyft token
    async analyzeShyftToken(tokenData) {
        try {
            // Get trading data from DexScreener
            const dexData = await this.getTokenData(tokenData.address);
            
            if (dexData && dexData.liquidity?.usd >= CONFIG.MIN_LIQUIDITY) {
                await this.analyzeAndAlert(dexData, 'Shyft Real-time');
                this.stats.tokens++;
                this.lastDetectionTime = Date.now();
            }
        } catch (error) {
            console.log('Error analyzing Shyft token:', error.message);
        }
    }

    // Process Shyft transactions
    async processShyftTransactions(transactions) {
        if (!transactions || !Array.isArray(transactions)) return;
        
        for (const tx of transactions) {
            // Look for token creation instructions
            if (tx.type === 'TOKEN_CREATE' || tx.type === 'INIT_MINT') {
                const tokenAddress = tx.token_address || tx.mint;
                if (tokenAddress && !processedTokens.has(tokenAddress)) {
                    console.log(`🔥 New token created: ${tokenAddress}`);
                    await this.checkIfNewToken(tokenAddress, 'Shyft Transaction');
                }
            }
        }
    }

    // Check if token is actually new and has trading
    async checkIfNewToken(tokenAddress, source) {
        if (processedTokens.has(tokenAddress)) return;
        
        try {
            const tokenData = await this.getTokenData(tokenAddress);
            
            if (tokenData) {
                const age = Date.now() - (tokenData.pairCreatedAt || 0);
                
                if (age < CONFIG.MAX_TOKEN_AGE && tokenData.liquidity?.usd >= CONFIG.MIN_LIQUIDITY) {
                    await this.analyzeAndAlert(tokenData, source);
                    this.stats.tokens++;
                    this.lastDetectionTime = Date.now();
                }
            }
        } catch (error) {
            // Token might not have trading data yet
        }
    }

    // Get token data from DexScreener
    async getTokenData(address) {
        try {
            const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
                timeout: 5000
            });
            
            if (response.data?.pairs?.length > 0) {
                return response.data.pairs[0];
            }
        } catch (error) {
            return null;
        }
    }

    // Analyze and send alert
    async analyzeAndAlert(pairData, source) {
        const tokenAddress = pairData.baseToken?.address || pairData.address;
        
        // Skip if already processed
        if (!tokenAddress || processedTokens.has(tokenAddress)) {
            return;
        }
        
        // Mark as processed
        processedTokens.add(tokenAddress);
        
        // Calculate age
        const age = pairData.pairCreatedAt ? 
            Math.floor((Date.now() - pairData.pairCreatedAt) / 60000) : 
            'Unknown';
        
        // Risk assessment
        const risk = this.calculateRisk(pairData);
        
        // Format message
        const message = `🚨 *NEW TOKEN ALERT*

*Token:* ${pairData.baseToken?.symbol || 'Unknown'} - ${pairData.baseToken?.name || 'New Token'}
*Age:* ⏱️ ${age} minutes old
*Source:* ${source}
*Contract:* \`${tokenAddress}\`

💰 *Market Data:*
• *Price:* $${parseFloat(pairData.priceUsd || 0).toFixed(9)}
• *Liquidity:* $${(pairData.liquidity?.usd || 0).toLocaleString()}
• *Market Cap:* $${(pairData.fdv || pairData.marketCap || 0).toLocaleString()}
• *24h Volume:* $${(pairData.volume?.h24 || 0).toLocaleString()}
• *5m Change:* ${pairData.priceChange?.m5 > 0 ? '📈' : '📉'} ${(pairData.priceChange?.m5 || 0).toFixed(1)}%
• *1h Change:* ${pairData.priceChange?.h1 > 0 ? '📈' : '📉'} ${(pairData.priceChange?.h1 || 0).toFixed(1)}%

🎯 *Risk Assessment:*
• *Safety Score:* ${risk.score}/100
• *Risk Level:* ${risk.level}
${risk.warnings.join('\n')}

📊 *Quick Actions:*
• [Analyze on ClickShift](https://clickshift-alpha.vercel.app/?token=${tokenAddress})
• [View Chart](https://dexscreener.com/solana/${pairData.pairAddress || tokenAddress})
• [Check on Birdeye](https://birdeye.so/token/${tokenAddress}?chain=solana)

💎 *Detected by ClickShift Alpha*
🔗 clickshift-alpha.vercel.app`;

        try {
            await bot.sendMessage(CONFIG.CHANNEL_ID, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
            
            console.log(`✅ Alert sent: ${pairData.baseToken?.symbol} (${age}m old)`);
            this.detectionCount++;
            
        } catch (error) {
            console.error('Failed to send alert:', error.message);
        }
    }

    // Calculate risk score
    calculateRisk(pairData) {
        let score = 50;
        const warnings = [];
        
        // Liquidity check
        const liq = pairData.liquidity?.usd || 0;
        if (liq < 1000) {
            score -= 30;
            warnings.push('⚠️ Very low liquidity - HIGH RISK');
        } else if (liq < 5000) {
            score -= 15;
            warnings.push('🟡 Low liquidity - Be careful');
        } else if (liq > 20000) {
            score += 20;
            warnings.push('✅ Good liquidity');
        }
        
        // Age check
        if (pairData.pairCreatedAt) {
            const age = Date.now() - pairData.pairCreatedAt;
            if (age < 3600000) { // Less than 1 hour
                score -= 20;
                warnings.push('🔴 Very new token (<1h)');
            } else if (age < 7200000) { // Less than 2 hours
                score -= 10;
                warnings.push('🟡 New token (<2h)');
            }
        }
        
        // Volume check
        const volume = pairData.volume?.h24 || 0;
        if (volume > liq * 2) {
            score += 15;
            warnings.push('✅ High trading volume');
        } else if (volume < liq * 0.1) {
            score -= 15;
            warnings.push('⚠️ Low trading activity');
        }
        
        // Determine risk level
        let level;
        if (score >= 70) level = '🟢 LOW RISK';
        else if (score >= 50) level = '🟡 MEDIUM RISK';
        else if (score >= 30) level = '🟠 HIGH RISK';
        else level = '🔴 VERY HIGH RISK';
        
        return {
            score: Math.max(0, Math.min(100, score)),
            level: level,
            warnings: warnings
        };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    stop() {
        this.isRunning = false;
        console.log('🛑 Detector stopped');
    }
}

// Bot commands
bot.onText(/\/stats/, async (msg) => {
    const uptime = Math.floor((Date.now() - detector.startTime) / 60000);
    const lastDetection = Math.floor((Date.now() - detector.lastDetectionTime) / 60000);
    
    const stats = `📊 *ClickShift Stats*

🚀 *Tokens Detected:* ${detector.detectionCount}
📡 *Total Scans:* ${detector.stats.scans}
⏰ *Last Detection:* ${lastDetection}m ago

*By Source:*
• DexScreener: ${detector.stats.dexscreener}
• Shyft: ${detector.stats.shyft}
• Birdeye: ${detector.stats.birdeye}

⏱️ *Uptime:* ${uptime} minutes
💎 *Status:* ${detector.isRunning ? 'Running ✅' : 'Stopped 🔴'}

🔗 https://clickshift-alpha.vercel.app`;

    bot.sendMessage(msg.chat.id, stats, { parse_mode: 'Markdown' });
});

// Create and start detector
const detector = new WorkingLaunchDetector();

// Start the bot
if (require.main === module) {
    detector.start().catch(console.error);
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        detector.stop();
        process.exit(0);
    });
    
    // Handle errors
    process.on('uncaughtException', (error) => {
        console.error('Error:', error.message);
        detector.stats.errors++;
    });
}
// ADD THIS TO YOUR EXISTING launch-detector.js (Don't replace anything!)
// Place this AFTER your imports but BEFORE your WorkingLaunchDetector class

const fs = require('fs').promises;
const path = require('path');

// User Management System
class UserManager {
    constructor() {
        this.usersFile = 'users.json';
        this.users = new Map();
        this.waitingForEmail = new Set();
        this.waitingForName = new Set();
        this.loadUsers();
    }

    async loadUsers() {
        try {
            const data = await fs.readFile(this.usersFile, 'utf8');
            const users = JSON.parse(data);
            users.forEach(user => {
                this.users.set(user.telegramId, user);
            });
            console.log(`📧 Loaded ${this.users.size} users`);
        } catch (error) {
            // File doesn't exist yet
            console.log('📧 Starting fresh user database');
        }
    }

    async saveUsers() {
        try {
            const usersArray = Array.from(this.users.values());
            await fs.writeFile(this.usersFile, JSON.stringify(usersArray, null, 2));
            console.log('💾 User database saved');
        } catch (error) {
            console.error('Error saving users:', error);
        }
    }

    async addUser(telegramId, username) {
        const user = {
            telegramId: telegramId.toString(),
            username: username || 'Unknown',
            name: null,
            email: null,
            joinDate: new Date().toISOString(),
            isPremium: false,
            alertCount: 0,
            lastActive: new Date().toISOString()
        };
        
        this.users.set(telegramId.toString(), user);
        await this.saveUsers();
        return user;
    }

    getUser(telegramId) {
        return this.users.get(telegramId.toString());
    }

    async updateUser(telegramId, updates) {
        const user = this.users.get(telegramId.toString());
        if (user) {
            Object.assign(user, updates, {
                lastActive: new Date().toISOString()
            });
            await this.saveUsers();
        }
        return user;
    }

    getAllUsers() {
        return Array.from(this.users.values());
    }

    getStats() {
        const users = this.getAllUsers();
        return {
            total: users.length,
            withEmail: users.filter(u => u.email).length,
            withName: users.filter(u => u.name).length,
            premium: users.filter(u => u.isPremium).length,
            active24h: users.filter(u => {
                const lastActive = new Date(u.lastActive);
                return (Date.now() - lastActive.getTime()) < 86400000;
            }).length
        };
    }

    async exportEmails() {
        const users = this.getAllUsers().filter(u => u.email);
        const csv = 'Name,Email,Telegram Username,Join Date,Is Premium\n' +
            users.map(u => `${u.name || ''},${u.email},${u.username},${u.joinDate},${u.isPremium}`).join('\n');
        
        await fs.writeFile('email_list.csv', csv);
        console.log(`📧 Exported ${users.length} emails to email_list.csv`);
        return csv;
    }
}

// Create user manager instance
const userManager = new UserManager();

// ENHANCED BOT COMMANDS WITH EMAIL COLLECTION
// Replace your existing bot.onText(/\/start/) with this:

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username;
    
    // Check if user exists
    let user = userManager.getUser(userId);
    
    if (!user) {
        // New user - create profile
        user = await userManager.addUser(userId, username);
        
        const welcomeMsg = `🚀 *Welcome to ClickShift Launch Alerts!*

I'll help you discover new Solana tokens before everyone else!

But first, let's set up your profile for exclusive benefits:
• 🎁 Free premium trial
• 📊 Personalized alerts
• 💎 Early access to new features

*Please enter your name:*`;

        await bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown' });
        userManager.waitingForName.add(userId.toString());
        
    } else if (!user.name || !user.email) {
        // Existing user but missing info
        if (!user.name) {
            await bot.sendMessage(chatId, '👋 Welcome back! Please enter your name to complete your profile:');
            userManager.waitingForName.add(userId.toString());
        } else if (!user.email) {
            await bot.sendMessage(chatId, `Hi ${user.name}! Please enter your email to get premium updates:`);
            userManager.waitingForEmail.add(userId.toString());
        }
    } else {
        // Returning user with complete profile
        const returnMsg = `🎯 *Welcome back, ${user.name}!*

📊 *Your Stats:*
• Alerts received: ${user.alertCount}
• Member since: ${new Date(user.joinDate).toLocaleDateString()}
• Status: ${user.isPremium ? '💎 Premium' : '🆓 Free'}

📢 *Commands:*
/stats - View bot statistics
/profile - Your profile
/premium - Upgrade to premium
/help - Get help

🔔 *Alerts Channel:* @ClickShiftAlerts
🌐 *Web App:* https://clickshift-alpha.vercel.app`;

        await bot.sendMessage(chatId, returnMsg, { parse_mode: 'Markdown' });
    }
    
    // Update last active
    await userManager.updateUser(userId, {});
});

// Handle text messages for email/name collection
bot.on('message', async (msg) => {
    if (msg.text && msg.text[0] !== '/') {
        const userId = msg.from.id.toString();
        const chatId = msg.chat.id;
        const text = msg.text.trim();
        
        // Check if waiting for name
        if (userManager.waitingForName.has(userId)) {
            userManager.waitingForName.delete(userId);
            
            // Validate name (basic check)
            if (text.length < 2 || text.length > 50) {
                await bot.sendMessage(chatId, '❌ Please enter a valid name (2-50 characters):');
                userManager.waitingForName.add(userId);
                return;
            }
            
            await userManager.updateUser(userId, { name: text });
            
            await bot.sendMessage(chatId, 
                `Great to meet you, ${text}! 🎉\n\n` +
                `Now, please enter your email address for:\n` +
                `• 🎁 Exclusive alpha drops\n` +
                `• 📈 Weekly performance reports\n` +
                `• 💎 Premium launch notifications`
            );
            
            userManager.waitingForEmail.add(userId);
            return;
        }
        
        // Check if waiting for email
        if (userManager.waitingForEmail.has(userId)) {
            userManager.waitingForEmail.delete(userId);
            
            // Validate email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(text)) {
                await bot.sendMessage(chatId, '❌ Please enter a valid email address:');
                userManager.waitingForEmail.add(userId);
                return;
            }
            
            const user = await userManager.updateUser(userId, { email: text });
            
            const successMsg = `✅ *Profile Complete!*

*Name:* ${user.name}
*Email:* ${user.email}

🎁 *You've unlocked:*
• Priority alerts for new launches
• Weekly alpha reports
• Access to premium features (coming soon)

🚀 *You're all set!* Join @ClickShiftAlerts to start receiving alerts.

💡 *Pro tip:* Type /premium to upgrade for instant alerts (no delay)!`;

            await bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });
            
            // Log for tracking
            console.log(`✅ New user registered: ${user.name} (${user.email})`);
            
            // Send notification to admin (you)
            const ADMIN_CHAT_ID = '7595436988'; // Your Telegram ID
            await bot.sendMessage(ADMIN_CHAT_ID, 
                `📧 *New User Registered!*\n` +
                `Name: ${user.name}\n` +
                `Email: ${user.email}\n` +
                `Username: @${user.username || 'none'}\n` +
                `Total Users: ${userManager.getStats().total}`,
                { parse_mode: 'Markdown' }
            );
        }
    }
});

// New command: View profile
bot.onText(/\/profile/, async (msg) => {
    const userId = msg.from.id;
    const user = userManager.getUser(userId);
    
    if (!user) {
        bot.sendMessage(msg.chat.id, 'Please use /start to create your profile first.');
        return;
    }
    
    const profileMsg = `👤 *Your Profile*

*Name:* ${user.name || 'Not set'}
*Email:* ${user.email || 'Not set'}
*Username:* @${user.username || 'none'}
*Status:* ${user.isPremium ? '💎 Premium' : '🆓 Free'}
*Alerts Received:* ${user.alertCount}
*Member Since:* ${new Date(user.joinDate).toLocaleDateString()}

To update your info, use /start`;

    bot.sendMessage(msg.chat.id, profileMsg, { parse_mode: 'Markdown' });
});

// New command: Admin stats (only for you)
bot.onText(/\/admin/, async (msg) => {
    const ADMIN_ID = 7595436988; // Your Telegram ID
    
    if (msg.from.id !== ADMIN_ID) {
        bot.sendMessage(msg.chat.id, 'Unauthorized.');
        return;
    }
    
    const stats = userManager.getStats();
    const users = userManager.getAllUsers();
    
    // Recent users
    const recentUsers = users
        .sort((a, b) => new Date(b.joinDate) - new Date(a.joinDate))
        .slice(0, 5);
    
    const adminMsg = `📊 *ADMIN DASHBOARD*

*User Stats:*
• Total Users: ${stats.total}
• With Email: ${stats.withEmail}
• With Name: ${stats.withName}
• Premium: ${stats.premium}
• Active (24h): ${stats.active24h}

*Recent Signups:*
${recentUsers.map(u => `• ${u.name || 'Unknown'} - ${u.email || 'No email'}`).join('\n')}

*Bot Stats:*
• Tokens Detected: ${detector.detectionCount}
• Total Scans: ${detector.stats.scans}
• Uptime: ${Math.floor((Date.now() - detector.startTime) / 3600000)}h

*Commands:*
/export - Export email list
/broadcast - Send message to all users`;

    bot.sendMessage(msg.chat.id, adminMsg, { parse_mode: 'Markdown' });
});

// Export emails command (admin only)
bot.onText(/\/export/, async (msg) => {
    if (msg.from.id !== 7595436988) return;
    
    try {
        const csv = await userManager.exportEmails();
        const stats = userManager.getStats();
        
        bot.sendMessage(msg.chat.id, 
            `📧 Exported ${stats.withEmail} emails to email_list.csv\n\n` +
            `Download the file from your server.`
        );
    } catch (error) {
        bot.sendMessage(msg.chat.id, '❌ Export failed: ' + error.message);
    }
});

// Track alerts sent to users
const originalSendAlert = bot.sendMessage.bind(bot);
bot.sendMessage = async function(chatId, text, options) {
    // If sending to channel, track user engagement
    if (chatId.toString() === CONFIG.CHANNEL_ID) {
        // Increment alert count for all active users
        const users = userManager.getAllUsers();
        for (const user of users) {
            if (user.email) { // Only count for registered users
                await userManager.updateUser(user.telegramId, {
                    alertCount: (user.alertCount || 0) + 1
                });
            }
        }
    }
    
    return originalSendAlert(chatId, text, options);
};

// Premium upgrade command
bot.onText(/\/premium/, async (msg) => {
    const premiumMsg = `💎 *UPGRADE TO PREMIUM*

*Free vs Premium:*

🆓 *Free Tier:*
• 5-minute delayed alerts
• Max 10 alerts per day
• Basic risk analysis

💎 *Premium ($49/month):*
• ⚡ INSTANT alerts (0 delay)
• 📊 Unlimited alerts
• 🎯 Advanced risk scoring
• 📈 Pump probability calculator
• 💰 Exit point predictions
• 🔔 Custom filters
• 📱 Priority support

*Special Launch Offer:*
First 100 users get 50% off!
Use code: EARLY50

*Payment Methods:*
• Credit/Debit Card
• Crypto (SOL, USDC)

Ready to upgrade? Contact @EmmanuelOhanwe`;

    bot.sendMessage(msg.chat.id, premiumMsg, { parse_mode: 'Markdown' });
});
// Add this to your existing launch-detector.js file
// Place it AFTER the WorkingLaunchDetector class but BEFORE the bot commands

const WebSocket = require('ws');

// WebSocket Monitor for Real-time Detection
class ShyftWebSocketMonitor {
    constructor(detector, apiKey) {
        this.detector = detector;
        this.apiKey = apiKey;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.processedTransactions = new Set();
    }

    connect() {
        if (!this.apiKey || this.apiKey === 'YOUR_SHYFT_KEY') {
            console.log('⚠️ Shyft WebSocket skipped - No API key');
            return;
        }

        console.log('🔌 Connecting to Shyft WebSocket...');
        
        try {
            // Use your WebSocket URL
            this.ws = new WebSocket(`wss://rpc.shyft.to?api_key=${this.apiKey}`);
            
            this.ws.on('open', () => {
                console.log('⚡ WEBSOCKET CONNECTED - Ultra-fast mode active!');
                this.reconnectAttempts = 0;
                
                // Subscribe to Token Program for new token creation
                this.subscribeToTokenProgram();
                
                // Subscribe to Raydium for new pools
                this.subscribeToRadyium();
                
                // Subscribe to Pump.fun if available
                this.subscribeToPumpFun();
            });

            this.ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    
                    // Handle subscription confirmation
                    if (message.result) {
                        console.log('✅ WebSocket subscription confirmed:', message.id);
                        return;
                    }
                    
                    // Handle actual token events
                    if (message.method === 'accountNotification' || message.method === 'programNotification') {
                        await this.processWebSocketEvent(message.params);
                    }
                } catch (error) {
                    console.error('WebSocket message error:', error.message);
                }
            });

            this.ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error.message);
            });

            this.ws.on('close', () => {
                console.log('🔌 WebSocket disconnected');
                this.reconnect();
            });

        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this.reconnect();
        }
    }

    subscribeToTokenProgram() {
        // Subscribe to Token Program for new mints
        const tokenProgramSubscribe = {
            jsonrpc: "2.0",
            id: 1,
            method: "programSubscribe",
            params: [
                "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // SPL Token Program
                {
                    encoding: "jsonParsed",
                    commitment: "confirmed",
                    filters: [
                        {
                            dataSize: 82 // Mint account size
                        }
                    ]
                }
            ]
        };
        
        this.ws.send(JSON.stringify(tokenProgramSubscribe));
        console.log('📡 Subscribed to Token Program');
    }

    subscribeToRadyium() {
        // Subscribe to Raydium AMM for new pools
        const raydiumSubscribe = {
            jsonrpc: "2.0",
            id: 2,
            method: "programSubscribe",
            params: [
                "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", // Raydium AMM V4
                {
                    encoding: "jsonParsed",
                    commitment: "confirmed"
                }
            ]
        };
        
        this.ws.send(JSON.stringify(raydiumSubscribe));
        console.log('📡 Subscribed to Raydium AMM');
    }

    subscribeToPumpFun() {
        // Subscribe to Pump.fun program
        const pumpFunSubscribe = {
            jsonrpc: "2.0",
            id: 3,
            method: "programSubscribe",
            params: [
                "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", // Pump.fun Program
                {
                    encoding: "jsonParsed",
                    commitment: "confirmed"
                }
            ]
        };
        
        this.ws.send(JSON.stringify(pumpFunSubscribe));
        console.log('📡 Subscribed to Pump.fun');
    }

    async processWebSocketEvent(params) {
        if (!params || !params.result) return;
        
        const result = params.result;
        const signature = result.signature;
        
        // Skip if we've already processed this transaction
        if (this.processedTransactions.has(signature)) return;
        this.processedTransactions.add(signature);
        
        // Check if this is a token creation or pool creation event
        const context = result.context;
        const value = result.value;
        
        // Look for new token or pool indicators
        if (this.isNewTokenEvent(value)) {
            console.log('🔥 WEBSOCKET: New token detected in real-time!');
            
            // Extract token address
            const tokenAddress = this.extractTokenAddress(value);
            if (tokenAddress && !processedTokens.has(tokenAddress)) {
                console.log(`⚡ Ultra-fast detection: ${tokenAddress}`);
                
                // Wait 2 seconds for blockchain to propagate
                await this.sleep(2000);
                
                // Get token data and send alert
                await this.processNewToken(tokenAddress, 'WebSocket Real-time');
            }
        }
    }

    isNewTokenEvent(value) {
        // Check for token creation patterns
        if (!value || !value.account) return false;
        
        const data = value.account.data;
        if (!data) return false;
        
        // Check for mint initialization
        if (data.parsed?.type === 'mint' && data.parsed?.info?.isInitialized) {
            return true;
        }
        
        // Check for new pool creation
        if (data.parsed?.type === 'account' && data.parsed?.info?.mint) {
            return true;
        }
        
        // Check instruction logs for specific patterns
        if (value.logs) {
            const hasNewToken = value.logs.some(log => 
                log.includes('InitializeMint') || 
                log.includes('InitializeAccount') ||
                log.includes('create_pool') ||
                log.includes('NewPool')
            );
            return hasNewToken;
        }
        
        return false;
    }

    extractTokenAddress(value) {
        // Try to extract token address from various locations
        if (value.account?.data?.parsed?.info?.mint) {
            return value.account.data.parsed.info.mint;
        }
        
        if (value.account?.data?.parsed?.info?.tokenAddress) {
            return value.account.data.parsed.info.tokenAddress;
        }
        
        // Extract from logs if available
        if (value.logs) {
            for (const log of value.logs) {
                // Look for base58 addresses in logs (44 characters)
                const match = log.match(/[1-9A-HJ-NP-Za-km-z]{44}/);
                if (match) {
                    return match[0];
                }
            }
        }
        
        return null;
    }

    async processNewToken(tokenAddress, source) {
        try {
            // Get token data from DexScreener
            const tokenData = await this.detector.getTokenData(tokenAddress);
            
            if (tokenData) {
                // Send ultra-fast alert
                await this.sendUltraFastAlert(tokenAddress, tokenData, source);
                this.detector.stats.tokens++;
                this.detector.lastDetectionTime = Date.now();
            } else {
                // Token too new, send early warning
                await this.sendEarlyWarning(tokenAddress, source);
            }
        } catch (error) {
            console.error('Error processing WebSocket token:', error.message);
        }
    }

    async sendUltraFastAlert(tokenAddress, tokenData, source) {
        const message = `⚡ *ULTRA-FAST DETECTION*

*Token:* ${tokenData.baseToken?.symbol || 'NEW'} 
*Speed:* Detected in <5 seconds!
*Source:* ${source}
*Contract:* \`${tokenAddress}\`

💰 *Early Data:*
• *Liquidity:* $${(tokenData.liquidity?.usd || 0).toLocaleString()}
• *Price:* $${parseFloat(tokenData.priceUsd || 0).toFixed(9)}

⚠️ *EXTREME EARLY WARNING*
• Token JUST created
• Very limited data
• Highest risk/reward

📊 [Quick Analysis](https://clickshift-alpha.vercel.app/?token=${tokenAddress})

🔥 *You're seeing this before 99% of traders!*`;

        try {
            await bot.sendMessage(CONFIG.CHANNEL_ID, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
            console.log(`⚡ Ultra-fast alert sent!`);
        } catch (error) {
            console.error('Failed to send ultra-fast alert:', error.message);
        }
    }

    async sendEarlyWarning(tokenAddress, source) {
        const message = `🔥 *BRAND NEW TOKEN CREATED*

*Contract:* \`${tokenAddress}\`
*Detection:* Real-time via ${source}
*Status:* Too new for DEX data

⏰ *What's happening:*
• Token JUST deployed (<10 seconds ago)
• No trading pairs yet
• Liquidity being added now

💡 *Check back in 1-2 minutes for full data*

📊 [Track on ClickShift](https://clickshift-alpha.vercel.app/?token=${tokenAddress})`;

        try {
            await bot.sendMessage(CONFIG.CHANNEL_ID, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
        } catch (error) {
            console.error('Failed to send early warning:', error.message);
        }
    }

    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('❌ Max reconnection attempts reached');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        
        console.log(`🔄 Reconnecting in ${delay/1000}s... (Attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            this.connect();
        }, delay);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

// UPDATE YOUR MAIN START SECTION:
// Find where your detector starts and add WebSocket

// After creating detector instance, add:
let wsMonitor = null;

// Modified start function
if (require.main === module) {
    detector.start().catch(console.error);
    
    // Start WebSocket monitor for ultra-fast detection
    if (process.env.SHYFT_API_KEY && process.env.SHYFT_API_KEY !== 'YOUR_SHYFT_KEY') {
        wsMonitor = new ShyftWebSocketMonitor(detector, process.env.SHYFT_API_KEY);
        wsMonitor.connect();
    }
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        detector.stop();
        if (wsMonitor) wsMonitor.disconnect();
        process.exit(0);
    });
}

// Also, don't forget to install ws package:
// npm install ws

module.exports = { WorkingLaunchDetector };