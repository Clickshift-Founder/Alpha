// trading-bot.js - Beta Trading Integration for ClickShift

const { Connection, PublicKey, Transaction } = require('@solana/web3.js');
const { Jupiter } = require('@jup-ag/core');

class ClickShiftTrader {
    constructor() {
        this.connection = new Connection('https://api.mainnet-beta.solana.com');
        this.jupiter = null;
        this.userWallets = new Map(); // Store user wallets
    }

    async initialize() {
        // Initialize Jupiter aggregator for best prices
        this.jupiter = await Jupiter.load({
            connection: this.connection,
            cluster: 'mainnet-beta',
            user: null // Will be set per user
        });
        
        console.log('🔄 Trading engine initialized');
    }

    // Telegram bot command for trading
    setupTradingCommands(bot) {
        // Buy command
        bot.onText(/\/buy (.+)/, async (msg, match) => {
            const userId = msg.from.id;
            const [tokenAddress, amount] = match[1].split(' ');
            
            await this.executeBuy(userId, tokenAddress, amount, msg.chat.id);
        });

        // Sell command
        bot.onText(/\/sell (.+)/, async (msg, match) => {
            const userId = msg.from.id;
            const [tokenAddress, percentage] = match[1].split(' ');
            
            await this.executeSell(userId, tokenAddress, percentage, msg.chat.id);
        });

        // Wallet setup
        bot.onText(/\/wallet/, async (msg) => {
            const setupMsg = `💰 *Wallet Setup*

To start trading:

1️⃣ *Generate Wallet:* /newwallet
2️⃣ *Import Wallet:* /import YOUR_PRIVATE_KEY
3️⃣ *View Balance:* /balance

⚠️ *BETA WARNING:*
• Start with small amounts
• Not responsible for losses
• Always DYOR

*Trading Commands:*
• Buy: /buy TOKEN_ADDRESS AMOUNT_SOL
• Sell: /sell TOKEN_ADDRESS PERCENTAGE
• Auto-buy on alert: /autobuy on`;

            bot.sendMessage(msg.chat.id, setupMsg, { parse_mode: 'Markdown' });
        });

        // Balance check
        bot.onText(/\/balance/, async (msg) => {
            const userId = msg.from.id;
            const wallet = this.userWallets.get(userId);
            
            if (!wallet) {
                bot.sendMessage(msg.chat.id, '❌ No wallet connected. Use /wallet to setup.');
                return;
            }
            
            const balance = await this.getBalance(wallet.publicKey);
            
            const balanceMsg = `💰 *Your Balance*

*SOL:* ${balance.sol} SOL
*USDC:* ${balance.usdc} USDC

*Wallet:* \`${wallet.publicKey}\`

*Recent Trades:*
${await this.getRecentTrades(userId)}`;

            bot.sendMessage(msg.chat.id, balanceMsg, { parse_mode: 'Markdown' });
        });
    }

    async executeBuy(userId, tokenAddress, amountSol, chatId) {
        try {
            const wallet = this.userWallets.get(userId);
            if (!wallet) {
                bot.sendMessage(chatId, '❌ No wallet connected. Use /wallet first.');
                return;
            }

            // Get best route via Jupiter
            const routes = await this.jupiter.computeRoutes({
                inputMint: new PublicKey('So11111111111111111111111111111111111111112'), // SOL
                outputMint: new PublicKey(tokenAddress),
                amount: amountSol * 1e9, // Convert to lamports
                slippage: 1 // 1% slippage
            });

            if (!routes.routesInfos.length) {
                bot.sendMessage(chatId, '❌ No trading route found');
                return;
            }

            const bestRoute = routes.routesInfos[0];
            const expectedOutput = bestRoute.outAmount / 1e9;

            // Show confirmation
            const confirmMsg = `🔄 *Trade Preview*

*Buying:* ${expectedOutput} tokens
*Paying:* ${amountSol} SOL
*Price Impact:* ${bestRoute.priceImpactPct}%
*Route:* ${bestRoute.marketInfos.map(m => m.label).join(' → ')}

Reply with /confirm to execute or /cancel`;

            bot.sendMessage(chatId, confirmMsg, { parse_mode: 'Markdown' });

            // Store pending trade
            this.pendingTrades.set(userId, {
                type: 'buy',
                route: bestRoute,
                amount: amountSol
            });

        } catch (error) {
            bot.sendMessage(chatId, `❌ Trade failed: ${error.message}`);
        }
    }

    async executeSell(userId, tokenAddress, percentage, chatId) {
        // Similar to buy but reversed
        // Get token balance, calculate amount to sell
        // Execute via Jupiter
    }

    async getBalance(walletAddress) {
        const balance = await this.connection.getBalance(new PublicKey(walletAddress));
        return {
            sol: balance / 1e9,
            usdc: 0 // Implement USDC balance check
        };
    }

    async getRecentTrades(userId) {
        // Return formatted recent trades
        return '• Bought $BONK: +45%\n• Sold $WIF: +120%';
    }
}

// Auto-trading on new token alerts
class AutoTrader {
    constructor(trader, detector) {
        this.trader = trader;
        this.detector = detector;
        this.autoTradeUsers = new Set();
        this.settings = new Map();
    }

    enableAutoTrade(userId, settings) {
        this.autoTradeUsers.add(userId);
        this.settings.set(userId, {
            maxPerTrade: settings.maxPerTrade || 0.1, // 0.1 SOL default
            minSafetyScore: settings.minSafetyScore || 70,
            stopLoss: settings.stopLoss || -50, // -50%
            takeProfit: settings.takeProfit || 100 // +100%
        });
    }

    async onNewToken(tokenData, safetyScore) {
        // Check all auto-trade users
        for (const userId of this.autoTradeUsers) {
            const settings = this.settings.get(userId);
            
            // Check if meets criteria
            if (safetyScore.score >= settings.minSafetyScore) {
                await this.trader.executeBuy(
                    userId,
                    tokenData.address,
                    settings.maxPerTrade,
                    userId // Send notification to user
                );
                
                // Set stop-loss and take-profit
                this.setTrailingOrders(userId, tokenData.address, settings);
            }
        }
    }

    setTrailingOrders(userId, tokenAddress, settings) {
        // Monitor price and auto-sell at stop-loss or take-profit
        setInterval(async () => {
            const currentPrice = await this.getCurrentPrice(tokenAddress);
            const entry = this.entryPrices.get(`${userId}-${tokenAddress}`);
            
            const change = ((currentPrice - entry) / entry) * 100;
            
            if (change <= settings.stopLoss || change >= settings.takeProfit) {
                await this.trader.executeSell(userId, tokenAddress, 100);
            }
        }, 30000); // Check every 30 seconds
    }
}

// Initialize trading
const trader = new ClickShiftTrader();
trader.initialize();
trader.setupTradingCommands(bot);

// Connect to detector for auto-trading
const autoTrader = new AutoTrader(trader, detector);

// Export for use in main bot
module.exports = { ClickShiftTrader, AutoTrader };