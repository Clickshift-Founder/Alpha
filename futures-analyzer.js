// ClickShift TradeSafe - Futures Trading Analyzer
// Analyzes perpetual futures markets for entry/exit points with leverage

const axios = require('axios');

// Futures Trading Configuration
const FUTURES_CONFIG = {
    // Risk levels for different leverage amounts
    LEVERAGE_LIMITS: {
        LOW_RISK: 5,      // 5x max leverage
        MEDIUM_RISK: 10,  // 10x max leverage  
        HIGH_RISK: 20,    // 20x max leverage
        DEGEN: 50         // 50x max leverage
    },
    
    // Position sizing recommendations
    POSITION_SIZES: {
        CONSERVATIVE: 0.02,  // 2% of portfolio
        MODERATE: 0.05,      // 5% of portfolio
        AGGRESSIVE: 0.10,    // 10% of portfolio
        YOLO: 0.25          // 25% of portfolio
    },
    
    // Technical levels
    SUPPORT_RESISTANCE_PERIODS: [24, 168, 720], // 24h, 7d, 30d in hours
};

// Get futures market data
async function getFuturesData(symbol) {
    try {
        console.log(`🔍 Analyzing ${symbol} futures market...`);
        
        // Try multiple data sources for better reliability
        const apis = [
            {
                name: 'Binance',
                ticker: `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}USDT`,
                funding: `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}USDT&limit=10`,
                oi: `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}USDT`
            },
            {
                name: 'Alternative',
                ticker: `https://api.coinbase.com/v2/exchange-rates?currency=${symbol}`,
                funding: null,
                oi: null
            }
        ];
        
        // Try Binance first, then fallback
        for (const api of apis) {
            try {
                if (api.name === 'Binance') {
                    const [tickerData, fundingData, openInterestData] = await Promise.all([
                        axios.get(api.ticker),
                        axios.get(api.funding),
                        axios.get(api.oi)
                    ]);
                    
                    const ticker = tickerData.data;
                    const funding = fundingData.data;
                    const openInterest = openInterestData.data;
                    
                    return {
                        symbol: symbol,
                        price: parseFloat(ticker.lastPrice),
                        volume24h: parseFloat(ticker.volume),
                        priceChange24h: parseFloat(ticker.priceChangePercent),
                        high24h: parseFloat(ticker.highPrice),
                        low24h: parseFloat(ticker.lowPrice),
                        fundingRate: parseFloat(funding[0]?.fundingRate || 0) * 100,
                        openInterest: parseFloat(openInterest.openInterest),
                        openInterestValue: parseFloat(openInterest.openInterest) * parseFloat(ticker.lastPrice)
                    };
                } else {
                    // Fallback to simpler data source
                    const response = await axios.get(api.ticker);
                    const price = parseFloat(response.data.data.rates.USD);
                    
                    console.log('⚠️ Using fallback data source (limited features)');
                    return {
                        symbol: symbol,
                        price: price,
                        volume24h: 0,
                        priceChange24h: 0,
                        high24h: price * 1.05,
                        low24h: price * 0.95,
                        fundingRate: 0,
                        openInterest: 0,
                        openInterestValue: 0
                    };
                }
            } catch (apiError) {
                console.log(`⚠️ ${api.name} API unavailable: ${apiError.message}`);
                continue;
            }
        }
        
        throw new Error('All data sources unavailable');
    } catch (error) {
        console.error('❌ Error fetching futures data:', error.message);
        console.log('💡 Try again in a few minutes or check your internet connection');
        return null;
    }
}

// Analyze market sentiment from futures data
function analyzeFuturesSentiment(data) {
    const sentiment = {
        overall: 'NEUTRAL',
        signals: [],
        score: 0
    };
    
    // Funding rate analysis
    if (data.fundingRate > 0.1) {
        sentiment.signals.push('🔴 High positive funding - longs paying shorts (bearish)');
        sentiment.score -= 20;
    } else if (data.fundingRate < -0.05) {
        sentiment.signals.push('🟢 Negative funding - shorts paying longs (bullish)');
        sentiment.score += 15;
    } else {
        sentiment.signals.push('🟡 Neutral funding rate');
    }
    
    // Price momentum
    if (data.priceChange24h > 10) {
        sentiment.signals.push('🚀 Strong upward momentum (+10%+)');
        sentiment.score += 25;
    } else if (data.priceChange24h < -10) {
        sentiment.signals.push('📉 Strong downward momentum (-10%+)');
        sentiment.score -= 25;
    }
    
    // Volume analysis
    const avgOpenInterest = data.openInterestValue / 1000000; // In millions
    if (avgOpenInterest > 100) {
        sentiment.signals.push('💪 High open interest (>$100M) - strong conviction');
        sentiment.score += 10;
    } else if (avgOpenInterest < 10) {
        sentiment.signals.push('⚠️ Low open interest (<$10M) - low conviction');
        sentiment.score -= 10;
    }
    
    // Determine overall sentiment
    if (sentiment.score > 20) sentiment.overall = 'BULLISH';
    else if (sentiment.score < -20) sentiment.overall = 'BEARISH';
    
    return sentiment;
}

// Calculate support and resistance levels
function calculateSupportResistance(data) {
    const currentPrice = data.price;
    const high24h = data.high24h;
    const low24h = data.low24h;
    
    // Simple S/R calculation (in real version, we'd use more historical data)
    const range = high24h - low24h;
    const levels = [];
    
    // Key psychological levels
    const roundNumbers = [
        Math.floor(currentPrice),
        Math.ceil(currentPrice),
        Math.floor(currentPrice * 1.1), // 10% above
        Math.floor(currentPrice * 0.9)  // 10% below
    ];
    
    // Fibonacci-like levels based on 24h range
    const fibLevels = [
        low24h + (range * 0.236),
        low24h + (range * 0.382),
        low24h + (range * 0.618),
        low24h + (range * 0.786)
    ];
    
    levels.push(
        { level: low24h, type: 'Support', strength: 'Strong', reason: '24h Low' },
        { level: high24h, type: 'Resistance', strength: 'Strong', reason: '24h High' },
        { level: fibLevels[0], type: 'Support', strength: 'Medium', reason: 'Fib 23.6%' },
        { level: fibLevels[2], type: 'Resistance', strength: 'Medium', reason: 'Fib 61.8%' }
    );
    
    return levels.sort((a, b) => Math.abs(a.level - currentPrice) - Math.abs(b.level - currentPrice));
}

// Generate trading recommendations
function generateTradingRecommendations(data, sentiment, levels) {
    const recommendations = [];
    const currentPrice = data.price;
    
    // Long setup
    if (sentiment.overall === 'BULLISH' || sentiment.score > 0) {
        const nearestSupport = levels.find(l => l.type === 'Support' && l.level < currentPrice);
        const nearestResistance = levels.find(l => l.type === 'Resistance' && l.level > currentPrice);
        
        if (nearestSupport && nearestResistance) {
            const stopDistance = currentPrice - nearestSupport.level;
            const targetDistance = nearestResistance.level - currentPrice;
            const riskReward = targetDistance / stopDistance;
            
            if (riskReward > 1.5) {
                recommendations.push({
                    direction: 'LONG',
                    entry: currentPrice * 0.999, // Slightly below current price
                    stopLoss: nearestSupport.level * 0.995,
                    takeProfit: nearestResistance.level * 0.995,
                    leverage: sentiment.score > 30 ? 10 : 5,
                    riskReward: riskReward.toFixed(2),
                    confidence: sentiment.score > 30 ? 'HIGH' : 'MEDIUM'
                });
            }
        }
    }
    
    // Short setup
    if (sentiment.overall === 'BEARISH' || sentiment.score < -10) {
        const nearestResistance = levels.find(l => l.type === 'Resistance' && l.level > currentPrice);
        const nearestSupport = levels.find(l => l.type === 'Support' && l.level < currentPrice);
        
        if (nearestResistance && nearestSupport) {
            const stopDistance = nearestResistance.level - currentPrice;
            const targetDistance = currentPrice - nearestSupport.level;
            const riskReward = targetDistance / stopDistance;
            
            if (riskReward > 1.5) {
                recommendations.push({
                    direction: 'SHORT',
                    entry: currentPrice * 1.001, // Slightly above current price
                    stopLoss: nearestResistance.level * 1.005,
                    takeProfit: nearestSupport.level * 1.005,
                    leverage: Math.abs(sentiment.score) > 30 ? 10 : 5,
                    riskReward: riskReward.toFixed(2),
                    confidence: Math.abs(sentiment.score) > 30 ? 'HIGH' : 'MEDIUM'
                });
            }
        }
    }
    
    return recommendations;
}

// Calculate position sizing based on leverage and risk
function calculatePositionSize(recommendation, portfolioSize, riskTolerance) {
    const maxRisk = portfolioSize * FUTURES_CONFIG.POSITION_SIZES[riskTolerance];
    const entryPrice = recommendation.entry;
    const stopLoss = recommendation.stopLoss;
    const leverage = recommendation.leverage;
    
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    const maxUnits = maxRisk / riskPerUnit;
    const notionalValue = maxUnits * entryPrice;
    const requiredMargin = notionalValue / leverage;
    
    return {
        notionalValue: notionalValue,
        requiredMargin: requiredMargin,
        units: maxUnits,
        riskAmount: maxRisk,
        marginPercent: (requiredMargin / portfolioSize * 100).toFixed(2)
    };
}

// Display comprehensive futures analysis
function displayFuturesAnalysis(data, sentiment, levels, recommendations) {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 CLICKSHIFT FUTURES TRADING ANALYSIS');
    console.log('='.repeat(70));
    
    // Market Overview
    console.log(`\n📊 ${data.symbol}/USDT PERPETUAL FUTURES`);
    console.log(`💰 Price: $${data.price}`);
    console.log(`📈 24h Change: ${data.priceChange24h > 0 ? '+' : ''}${data.priceChange24h}%`);
    console.log(`📊 24h Volume: ${(data.volume24h / 1000000).toFixed(1)}M USDT`);
    console.log(`🔄 Open Interest: $${(data.openInterestValue / 1000000).toFixed(1)}M`);
    console.log(`💸 Funding Rate: ${data.fundingRate > 0 ? '+' : ''}${data.fundingRate.toFixed(4)}%`);
    
    // Market Sentiment
    console.log(`\n🎯 MARKET SENTIMENT: ${sentiment.overall} (Score: ${sentiment.score})`);
    sentiment.signals.forEach(signal => console.log(`  ${signal}`));
    
    // Support & Resistance
    console.log('\n📊 KEY LEVELS:');
    levels.slice(0, 4).forEach(level => {
        const distance = ((level.level - data.price) / data.price * 100).toFixed(2);
        console.log(`  ${level.type}: $${level.level.toFixed(4)} (${distance > 0 ? '+' : ''}${distance}%) - ${level.reason}`);
    });
    
    // Trading Recommendations
    console.log('\n💡 TRADING RECOMMENDATIONS:');
    if (recommendations.length === 0) {
        console.log('  ⏳ No clear setups available. Wait for better R:R opportunities.');
    } else {
        recommendations.forEach((rec, index) => {
            console.log(`\n  ${index + 1}. ${rec.direction} SETUP (${rec.confidence} confidence)`);
            console.log(`     📍 Entry: $${rec.entry.toFixed(4)}`);
            console.log(`     🛑 Stop Loss: $${rec.stopLoss.toFixed(4)}`);
            console.log(`     🎯 Take Profit: $${rec.takeProfit.toFixed(4)}`);
            console.log(`     📊 Leverage: ${rec.leverage}x`);
            console.log(`     ⚖️ Risk:Reward = 1:${rec.riskReward}`);
            
            // Position sizing example
            const sizing = calculatePositionSize(rec, 10000, 'MODERATE'); // $10K portfolio example
            console.log(`     💰 Position Size (10K portfolio): $${sizing.notionalValue.toFixed(0)} notional`);
            console.log(`     💵 Required Margin: $${sizing.requiredMargin.toFixed(0)} (${sizing.marginPercent}%)`);
        });
    }
    
    // Risk Warnings
    console.log('\n⚠️ RISK WARNINGS:');
    console.log('  • Futures trading involves high risk of loss');
    console.log('  • Never risk more than you can afford to lose');
    console.log('  • Use proper position sizing and risk management');
    console.log('  • Consider market volatility and liquidity');
    
    console.log('\n' + '='.repeat(70));
}

// Main futures analysis function
async function analyzeFutures(symbol) {
    try {
        // Get market data
        const data = await getFuturesData(symbol);
        if (!data) return;
        
        // Analyze sentiment
        const sentiment = analyzeFuturesSentiment(data);
        
        // Calculate levels
        const levels = calculateSupportResistance(data);
        
        // Generate recommendations
        const recommendations = generateTradingRecommendations(data, sentiment, levels);
        
        // Display analysis
        displayFuturesAnalysis(data, sentiment, levels, recommendations);
        
        return { data, sentiment, levels, recommendations };
    } catch (error) {
        console.error('❌ Futures analysis failed:', error.message);
    }
}

// Interactive futures analyzer
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function showFuturesMenu() {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 CLICKSHIFT FUTURES ANALYZER');
    console.log('='.repeat(50));
    console.log('1. Analyze SOL futures');
    console.log('2. Analyze BTC futures');
    console.log('3. Analyze ETH futures');
    console.log('4. Custom symbol');
    console.log('5. Exit');
    console.log('='.repeat(50));
}

async function handleFuturesChoice(choice) {
    switch(choice.trim()) {
        case '1':
            await analyzeFutures('SOL');
            showFuturesMenuAndWait();
            break;
        case '2':
            await analyzeFutures('BTC');
            showFuturesMenuAndWait();
            break;
        case '3':
            await analyzeFutures('ETH');
            showFuturesMenuAndWait();
            break;
        case '4':
            rl.question('Enter symbol (e.g., AVAX, LINK, DOT): ', async (symbol) => {
                await analyzeFutures(symbol.toUpperCase());
                showFuturesMenuAndWait();
            });
            break;
        case '5':
            console.log('\n👋 Happy trading with ClickShift Futures!');
            rl.close();
            break;
        default:
            console.log('❌ Invalid choice. Please select 1-5.');
            showFuturesMenuAndWait();
    }
}

function showFuturesMenuAndWait() {
    showFuturesMenu();
    rl.question('Select an option (1-5): ', handleFuturesChoice);
}

// Start futures analyzer
function startFuturesApp() {
    console.log('🎉 Welcome to ClickShift Futures Trading Analyzer!');
    console.log('💡 Get leverage trading recommendations with proper risk management');
    showFuturesMenuAndWait();
}

// Export for use
module.exports = { analyzeFutures };

// Run if called directly
if (require.main === module) {
    startFuturesApp();
}