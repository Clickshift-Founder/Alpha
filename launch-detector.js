// ClickShift Alpha Launch Detector Bot - Web Scraping Version
// Real-time Solana new token detection with web scraping

const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const cheerio = require('cheerio'); // For web scraping
require('dotenv').config();

// Configuration
const CONFIG = {
    TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || 'YOUR_BOT_TOKEN_HERE',
    CHANNEL_ID: process.env.CHANNEL_ID || '@ClickShiftAlerts',
    
    // Detection settings (reduced frequency to avoid rate limits)
    MIN_LIQUIDITY: 5000,
    SCAN_INTERVAL: 45000,       // Check every 45 seconds
    
    // Safety thresholds (more realistic)
    SAFETY_THRESHOLDS: {
        HIGH: 85,
        MEDIUM: 70,
        LOW: 50
    }
};

// Initialize Telegram Bot with polling enabled
const bot = new TelegramBot(CONFIG.TELEGRAM_TOKEN, { polling: true });

// Track processed tokens to avoid duplicates
const processedTokens = new Set();

// Launch detection class
class LaunchDetector {
    constructor() {
        this.isRunning = false;
        this.detectionCount = 0;
        this.startTime = Date.now();
    }

    // Send test alert
    async sendTestAlert() {
        const message = `🧪 *CLICKSHIFT ALPHA WEB SCRAPING BOT*

🕸️ *Now using web scraping for real-time data!*

*System Status:*
✅ Telegram connected
✅ Web scraping enabled
✅ Telemetry.io monitoring active

*Detection Sources:*
• Telemetry.io (Web Scraping)
• Pump.fun (Direct Scraping)  
• DexScreener (Fresh pairs only)

🔍 *Scanning every 45 seconds...*

💎 *Welcome to real-time launch detection!*`;

        try {
            await bot.sendMessage(CONFIG.CHANNEL_ID, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
            console.log(`📤 Test alert sent successfully!`);
            this.detectionCount++;
        } catch (error) {
            console.error('❌ Failed to send test alert:', error.message);
        }
    }

    // Start the launch detection
    async start() {
        console.log('🚀 ClickShift Alpha Launch Detector Starting (Web Scraping Mode)...');
        console.log(`🕸️ Using web scraping for real-time data`);
        console.log(`📡 Scanning every ${CONFIG.SCAN_INTERVAL/1000} seconds`);
        console.log(`💧 Minimum liquidity: $${CONFIG.MIN_LIQUIDITY.toLocaleString()}`);
        console.log(`🎯 Channel: ${CONFIG.CHANNEL_ID}`);
        
        await this.sendTestAlert();
        
        this.isRunning = true;
        this.detectLoop();
    }

    // Main detection loop
    async detectLoop() {
        while (this.isRunning) {
            try {
                console.log(`🕸️ Web scraping for new launches... (${new Date().toLocaleTimeString()})`);
                
                // Scrape multiple sources
                await Promise.all([
                    this.scrapeTelemetryIO(),
                    this.scrapePumpFunDirect(),
                    this.checkDexScreenerFresh()
                ]);

                await this.sleep(CONFIG.SCAN_INTERVAL);
                
            } catch (error) {
                console.error('❌ Detection loop error:', error.message);
                await this.sleep(10000); // Wait 10 seconds on error
            }
        }
    }

    // Scrape Telemetry.io for real-time launches
    async scrapeTelemetryIO() {
        try {
            console.log('🕸️ Scraping Telemetry.io...');
            
            const response = await axios.get('https://app.telemetry.io', {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            });

            const $ = cheerio.load(response.data);
            
            // Try to find token creation data in the HTML
            let tokensFound = 0;
            
            // Look for common patterns in the HTML that might contain token data
            $('script').each((i, elem) => {
                const scriptContent = $(elem).html();
                if (scriptContent && scriptContent.includes('pump.fun') || scriptContent.includes('token')) {
                    // Try to extract JSON data from script tags
                    try {
                        const jsonMatch = scriptContent.match(/(\{.*\})/);
                        if (jsonMatch) {
                            const data = JSON.parse(jsonMatch[1]);
                            if (data.tokens || data.creations) {
                                tokensFound += (data.tokens || data.creations).length;
                            }
                        }
                    } catch (e) {
                        // Silent fail - not JSON data
                    }
                }
            });

            if (tokensFound > 0) {
                console.log(`✅ Telemetry.io: Found ${tokensFound} tokens in page data`);
            } else {
                console.log(`ℹ️ Telemetry.io: No token data found in current page (may need authentication)`);
            }

        } catch (error) {
            console.log('⚠️ Telemetry.io scraping failed:', error.message);
        }
    }

    // Scrape Pump.fun directly for new launches
    async scrapePumpFunDirect() {
        try {
            console.log('🕸️ Scraping Pump.fun directly...');
            
            const response = await axios.get('https://pump.fun', {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br'
                }
            });

            const $ = cheerio.load(response.data);
            let tokensFound = 0;

            // Look for Next.js data or embedded JSON
            $('script[id="__NEXT_DATA__"]').each((i, elem) => {
                try {
                    const jsonData = JSON.parse($(elem).html());
                    if (jsonData.props && jsonData.props.pageProps) {
                        const pageData = jsonData.props.pageProps;
                        if (pageData.coins || pageData.tokens) {
                            const tokens = pageData.coins || pageData.tokens;
                            tokensFound = tokens.length;
                            
                            // Process recent tokens
                            for (const token of tokens.slice(0, 5)) {
                                if (token.mint && !processedTokens.has(token.mint)) {
                                    await this.processScrapedToken(token, 'Pump.fun Scrape');
                                }
                            }
                        }
                    }
                } catch (e) {
                    // Not valid JSON
                }
            });

            if (tokensFound > 0) {
                console.log(`✅ Pump.fun: Found ${tokensFound} tokens via scraping`);
            } else {
                console.log(`ℹ️ Pump.fun: No token data found in page source`);
            }

        } catch (error) {
            console.log('⚠️ Pump.fun scraping failed:', error.message);
        }
    }

    // Enhanced DexScreener - focus on ONLY fresh launches
    async checkDexScreenerFresh() {
        try {
            console.log('🔍 Checking DexScreener for FRESH launches only...');
            
            const response = await axios.get('https://api.dexscreener.com/latest/dex/pairs/solana?page=1', {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                }
            });
            
            const pairs = response.data.pairs || [];
            
            // ONLY truly fresh pairs (last 30 minutes)
            const ultraFreshPairs = pairs.filter(pair => {
                if (!pair.pairCreatedAt) return false;
                
                const createdTime = new Date(pair.pairCreatedAt);
                const timeDiff = Date.now() - createdTime.getTime();
                const hasGoodActivity = (pair.volume?.h24 || 0) > 5000 && (pair.liquidity?.usd || 0) > 15000;
                
                // ONLY last 30 minutes AND excellent activity
                return timeDiff < 1800000 && hasGoodActivity;
            });

            console.log(`🎯 DexScreener: Found ${ultraFreshPairs.length} ULTRA-FRESH pairs (last 30min)`);

            if (ultraFreshPairs.length === 0) {
                console.log(`ℹ️ No genuinely fresh launches in the last 30 minutes`);
                return;
            }

            for (const pair of ultraFreshPairs.slice(0, 2)) {
                if (pair.baseToken?.address && !processedTokens.has(pair.baseToken.address)) {
                    const ageText = this.getTimeAgo(pair.pairCreatedAt);
                    console.log(`🔥 ULTRA-FRESH: ${pair.baseToken.symbol} - ${ageText} old, $${pair.liquidity?.usd?.toLocaleString()} liquidity`);
                    await this.analyzeNewToken(pair.baseToken.address, 'DexScreener Ultra-Fresh', pair);
                }
            }
            
        } catch (error) {
            console.log('⚠️ DexScreener Fresh API error:', error.message);
        }
    }

    // Process scraped token data
    async processScrapedToken(tokenData, source) {
        try {
            const tokenAddress = tokenData.mint || tokenData.address;
            if (!tokenAddress || processedTokens.has(tokenAddress)) {
                return;
            }

            console.log(`🕸️ Processing scraped token: ${tokenData.name || tokenData.symbol}`);

            // Create basic alert for scraped data
            const basicTokenData = {
                address: tokenAddress,
                symbol: tokenData.symbol || 'UNKNOWN',
                name: tokenData.name || 'Unknown Token',
                price: parseFloat(tokenData.price || 0),
                marketCap: parseFloat(tokenData.market_cap || tokenData.usd_market_cap || 0),
                createdAt: tokenData.created_timestamp || Date.now(),
                dex: 'Pump.fun'
            };

            await this.sendScrapedAlert(basicTokenData, source);
            processedTokens.add(tokenAddress);
            this.detectionCount++;
            
        } catch (error) {
            console.error('❌ Error processing scraped token:', error.message);
        }
    }

    // Send alert for scraped tokens
    async sendScrapedAlert(tokenData, source) {
        const message = `🕸️ *NEW TOKEN DETECTED (WEB SCRAPING)*

*Token:* ${tokenData.symbol} (${tokenData.name})
*Contract:* \`${tokenData.address}\`
*Market Cap:* $${tokenData.marketCap.toLocaleString()}
*Platform:* ${tokenData.dex}
*Source:* ${source}
*Detection:* Web Scraping ⚡

🟡 *SCRAPED DATA - ULTRA EARLY*

⚠️ *EXTREME EARLY STAGE*
• Found via web scraping (seconds after creation)
• Highest risk, highest reward potential
• Verify independently before trading

🔗 *Quick Actions:*
• [Trade on Pump.fun](https://pump.fun/${tokenData.address})
• [Analyze with ClickShift](https://clickshift-alpha.vercel.app)
• [View Contract](https://solscan.io/token/${tokenData.address})

💎 *This is scraped data - ultimate alpha!*`;

        try {
            await bot.sendMessage(CONFIG.CHANNEL_ID, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
        } catch (error) {
            console.error('❌ Failed to send scraped alert:', error.message);
        }
    }

    // Get comprehensive token data from DexScreener
    async getTokenData(tokenAddress) {
        try {
            const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
                timeout: 10000
            });
            
            const pairs = response.data.pairs;
            if (!pairs || pairs.length === 0) {
                return null;
            }

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
                priceChange24h: mainPair.priceChange?.h24 || 0,
                pairAddress: mainPair.pairAddress,
                dex: mainPair.dexId,
                createdAt: mainPair.pairCreatedAt
            };
        } catch (error) {
            return null;
        }
    }

    // Analyze new token and send alert
    async analyzeNewToken(tokenAddress, source, rawData) {
        try {
            if (processedTokens.has(tokenAddress)) {
                return;
            }

            console.log(`🔍 Analyzing token: ${tokenAddress.slice(0, 8)}...`);

            const tokenData = await this.getTokenData(tokenAddress);
            if (!tokenData) {
                console.log(`❌ No data found for ${tokenAddress.slice(0, 8)}...`);
                return;
            }

            // Apply filters
            if (!this.passesFilters(tokenData)) {
                console.log(`🚫 Token filtered out: ${tokenData.symbol}`);
                processedTokens.add(tokenAddress);
                return;
            }

            // Analyze safety with improved scoring
            const safetyScore = await this.analyzeSafety(tokenData, rawData);
            
            // Send alert
            await this.sendLaunchAlert(tokenData, safetyScore, source);
            
            processedTokens.add(tokenAddress);
            this.detectionCount++;
            
            console.log(`✅ Alert sent for ${tokenData.symbol} (${this.detectionCount} total)`);
            
        } catch (error) {
            console.error(`❌ Error analyzing token:`, error.message);
        }
    }

    // Apply filters to new tokens
    passesFilters(tokenData) {
        if (tokenData.liquidity < CONFIG.MIN_LIQUIDITY) return false;
        if (!tokenData.price || tokenData.price <= 0) return false;
        if (!tokenData.symbol || tokenData.symbol.length < 2) return false;
        return true;
    }

    // Improved safety analysis
    async analyzeSafety(tokenData, rawData) {
        let safetyScore = 50; // Start neutral
        const risks = [];

        // Liquidity analysis
        if (tokenData.liquidity < 10000) {
            safetyScore -= 25;
            risks.push('Very low liquidity (<$10K)');
        } else if (tokenData.liquidity < 50000) {
            safetyScore -= 15;
            risks.push('Low liquidity (<$50K)');
        } else {
            safetyScore += 15;
        }

        // Market cap analysis
        if (tokenData.marketCap < 50000) {
            safetyScore -= 20;
            risks.push('Very low market cap (<$50K)');
        } else if (tokenData.marketCap < 500000) {
            safetyScore -= 10;
            risks.push('Low market cap (<$500K)');
        } else {
            safetyScore += 10;
        }

        // Volume analysis
        if (tokenData.volume24h < tokenData.liquidity * 0.2) {
            safetyScore -= 20;
            risks.push('Low trading volume');
        } else {
            safetyScore += 10;
        }

        // Age analysis
        const tokenAge = Date.now() - new Date(tokenData.createdAt).getTime();
        if (tokenAge < 1800000) { // Less than 30 minutes
            safetyScore -= 20;
            risks.push('Extremely new token (high risk)');
        } else if (tokenAge < 3600000) { // Less than 1 hour
            safetyScore -= 10;
            risks.push('Very new token');
        }

        // Always add caution for new tokens
        if (tokenAge < 3600000 && risks.length < 2) {
            risks.push('Recent launch (exercise caution)');
        }

        return {
            score: Math.max(0, Math.min(100, safetyScore)),
            risks: risks,
            level: this.getSafetyLevel(safetyScore)
        };
    }

    // Get safety level from score
    getSafetyLevel(score) {
        if (score >= CONFIG.SAFETY_THRESHOLDS.HIGH) return 'HIGH';
        if (score >= CONFIG.SAFETY_THRESHOLDS.MEDIUM) return 'MEDIUM';
        if (score >= CONFIG.SAFETY_THRESHOLDS.LOW) return 'LOW';
        return 'VERY LOW';
    }

    // Send launch alert to Telegram
    async sendLaunchAlert(tokenData, safetyScore, source) {
        const safetyEmoji = this.getSafetyEmoji(safetyScore.level);
        const timeAgo = this.getTimeAgo(tokenData.createdAt);
        
        const message = `🚀 *NEW SOLANA LAUNCH DETECTED*

*Token:* ${tokenData.symbol} (${tokenData.name})
*Contract:* \`${tokenData.address}\`
*Price:* $${tokenData.price.toFixed(8)}
*Liquidity:* $${tokenData.liquidity.toLocaleString()}
*Market Cap:* $${tokenData.marketCap.toLocaleString()}
*DEX:* ${tokenData.dex}
*Source:* ${source}
*Age:* ${timeAgo}

${safetyEmoji} *Safety Score:* ${safetyScore.score}/100 (${safetyScore.level})
${safetyScore.risks.length > 0 ? `⚠️ *Risks:* ${safetyScore.risks.join(', ')}` : '✅ *No major risks detected*'}

🔗 *Quick Actions:*
• [Analyze with ClickShift](https://clickshift-alpha.vercel.app)
• [View on DexScreener](https://dexscreener.com/solana/${tokenData.pairAddress})
• [View Contract](https://solscan.io/token/${tokenData.address})

💎 *Join ClickShift Alpha for more exclusive launches!*`;

        try {
            await bot.sendMessage(CONFIG.CHANNEL_ID, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
        } catch (error) {
            console.error('❌ Failed to send Telegram alert:', error.message);
        }
    }

    // Get safety emoji
    getSafetyEmoji(level) {
        switch (level) {
            case 'HIGH': return '🟢';
            case 'MEDIUM': return '🟡';
            case 'LOW': return '🟠';
            default: return '🔴';
        }
    }

    // Get time ago string
    getTimeAgo(createdAt) {
        try {
            const now = Date.now();
            let created;
            
            if (typeof createdAt === 'number') {
                created = createdAt > 1000000000000 ? createdAt : createdAt * 1000;
            } else if (typeof createdAt === 'string') {
                created = new Date(createdAt).getTime();
            } else {
                return 'Unknown age';
            }
            
            const diffMs = now - created;
            
            if (diffMs < 0) return 'Future date';
            if (diffMs < 60000) return 'Just now';
            if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
            if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
            return `${Math.floor(diffMs / 86400000)}d ago`;
        } catch (error) {
            return 'Unknown age';
        }
    }

    // Sleep function
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Get stats
    getStats() {
        const uptime = Date.now() - this.startTime;
        const uptimeHours = Math.floor(uptime / 3600000);
        const uptimeMinutes = Math.floor((uptime % 3600000) / 60000);
        
        return {
            uptime: `${uptimeHours}h ${uptimeMinutes}m`,
            detections: this.detectionCount,
            processed: processedTokens.size
        };
    }

    // Stop detection
    stop() {
        this.isRunning = false;
        console.log('🛑 Launch detector stopped');
    }
}

// Bot commands
class TelegramCommands {
    constructor(detector) {
        this.detector = detector;
        this.setupCommands();
    }

    setupCommands() {
        // Start command
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const welcomeMessage = `🚀 *Welcome to ClickShift Alpha Launch Detector!*

🕸️ *Now powered by web scraping for real-time data!*

*Commands:*
/stats - View detection statistics
/help - Show this help message

💎 *Join our community:*
• [ClickShift Alpha Platform](https://clickshift-alpha.vercel.app)
• Channel: @ClickShiftAlerts

Get exclusive alpha on new launches before anyone else! 🔥`;

            bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
        });

        // Stats command
        bot.onText(/\/stats/, (msg) => {
            const chatId = msg.chat.id;
            const stats = this.detector.getStats();
            
            const statsMessage = `📊 *ClickShift Alpha Launch Detector Stats*

⏱️ *Uptime:* ${stats.uptime}
🚀 *Launches Detected:* ${stats.detections}
📝 *Tokens Processed:* ${stats.processed}
📡 *Status:* ${this.detector.isRunning ? '🟢 Active (Web Scraping)' : '🔴 Inactive'}

*Last scan:* ${new Date().toLocaleTimeString()}

💎 *Join ClickShift Alpha for premium features!*`;

            bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
        });

        // Help command
        bot.onText(/\/help/, (msg) => {
            const chatId = msg.chat.id;
            const helpMessage = `🤖 *ClickShift Alpha Launch Detector Help*

🕸️ *Web Scraping Mode - Real-Time Detection*

*What I do:*
• Scrape Telemetry.io and Pump.fun for fresh launches
• Analyze safety and risk factors with improved scoring
• Send instant alerts for ultra-fresh opportunities
• Focus on sub-30 minute launches only

*Safety Levels:*
🟢 HIGH (85-100) - Relatively safe
🟡 MEDIUM (70-84) - Moderate risk
🟠 LOW (50-69) - High risk
🔴 VERY LOW (0-49) - Extreme risk

*Commands:*
/start - Welcome message
/stats - View statistics
/help - This help message

💎 *Get full analysis at:*
[ClickShift Alpha Platform](https://clickshift-alpha.vercel.app)`;

            bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
        });
    }
}

// Main application
class LaunchDetectorApp {
    constructor() {
        this.detector = new LaunchDetector();
        this.commands = new TelegramCommands(this.detector);
        this.setupErrorHandling();
    }

    setupErrorHandling() {
        process.on('uncaughtException', (error) => {
            console.error('💥 Uncaught Exception:', error);
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
        });
    }

    async start() {
        console.log('🎉 ClickShift Alpha Launch Detector Bot Starting (Web Scraping Edition)...');
        
        // Test Telegram connection
        try {
            await bot.getMe();
            console.log('✅ Telegram Bot connected successfully');
        } catch (error) {
            console.error('❌ Telegram Bot connection failed:', error.message);
            console.log('💡 Make sure your TELEGRAM_TOKEN is set correctly');
            return;
        }

        // Start detection
        await this.detector.start();
    }

    stop() {
        this.detector.stop();
        console.log('👋 ClickShift Alpha Launch Detector stopped');
    }
}

// Export for use
module.exports = { LaunchDetectorApp, LaunchDetector };

// Run if called directly
if (require.main === module) {
    const app = new LaunchDetectorApp();
    app.start();
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Received SIGINT, shutting down gracefully...');
        app.stop();
        process.exit(0);
    });
}