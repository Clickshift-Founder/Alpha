// ClickShift TradeSafe - Robust Futures Analyzer with Multiple Data Sources
const axios = require('axios');

// Enhanced configuration
const FUTURES_CONFIG = {
    LEVERAGE_LIMITS: {
        LOW_RISK: 5,
        MEDIUM_RISK: 10,
        HIGH_RISK: 20,
        DEGEN: 50
    },
    POSITION_SIZES: {
        CONSERVATIVE: 0.02,
        MODERATE: 0.05,
        AGGRESSIVE: 0.10,
        YOLO: 0.25
    },
    TIMEOUT: 10000, // 10 second timeout
    RETRY_ATTEMPTS: 3
};

// Multiple data sources for reliability
const DATA_SOURCES = [
    {
        name: 'CoinGecko',
        getPriceUrl: (symbol) => `https://api.coingecko.com/api/v3/simple/price?ids=${getCoingeckoId(symbol)}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`,
        parseData: (data, symbol) => {
            const id = getCoingeckoId(symbol);
            const coinData = data[id];
            return {
                symbol: symbol,
                price: coinData.usd,
                priceChange24h: coinData.usd_24h_change || 0,
                volume24h: coinData.usd_24h_vol || 0,
                high24h: coinData.usd * 1.05, // Estimate
                low24h: coinData.usd * 0.95,  // Estimate
                fundingRate: 0, // Not available
                openInterest: 0, // Not available
                openInterestValue: 0,
                source: 'CoinGecko'
            };
        }
    },
    {
        name: 'CoinCap',
        getPriceUrl: (symbol) => `https://api.coincap.io/v2/assets/${symbol.toLowerCase()}`,
        parseData: (data, symbol) => {
            const asset = data.data;
            return {
                symbol: symbol,
                price: parseFloat(asset.priceUsd),
                priceChange24h: parseFloat(asset.changePercent24Hr) || 0,
                volume24h: parseFloat(asset.volumeUsd24Hr) || 0,
                high24h: parseFloat(asset.priceUsd) * 1.05,
                low24h: parseFloat(asset.priceUsd) * 0.95,
                fundingRate: 0,
                openInterest: 0,
                openInterestValue: 0,
                source: 'CoinCap'
            };
        }
    }
];

// Map symbols to CoinGecko IDs
function getCoingeckoId(symbol) {
    const mapping = {
        'BTC': 'bitcoin',
        'ETH': 'ethereum',
        'SOL': 'solana',
        'BNB': 'binancecoin',
        'ADA': 'cardano',
        'DOT': 'polkadot',
        'AVAX': 'avalanche-2',
        'MATIC': 'matic-network',
        'LINK': 'chainlink',
        'UNI': 'uniswap'
    };
    return mapping[symbol.toUpperCase()] || symbol.toLowerCase();
}

// Enhanced API call with retry logic
async function makeApiCall(url, retries = FUTURES_CONFIG.RETRY_ATTEMPTS) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url, {
                timeout: FUTURES_CONFIG.TIMEOUT,
                headers: {
                    'User-Agent': 'ClickShift-TradeSafe/1.0'
                }
            });
            return response.data;
        } catch (error) {
            console.log(`⚠️ Attempt ${i + 1} failed: ${error.message}`);
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Progressive delay
        }
    }
}

// Get futures data from multiple sources
async function getFuturesData(symbol) {
    console.log(`🔍 Analyzing ${symbol} futures market...`);
    
    // Try Binance first (most comprehensive)
    try {
        console.log('📡 Trying Binance Futures API...');
        const [tickerData, fundingData, openInterestData] = await Promise.all([
            makeApiCall(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}USDT`),
            makeApiCall(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}USDT&limit=5`),
            makeApiCall(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}USDT`)
        ]);
        
        console.log('✅ Binance data retrieved successfully');
        return {
            symbol: symbol,
            price: parseFloat(tickerData.lastPrice),
            volume24h: parseFloat(tickerData.volume),
            priceChange24h: parseFloat(tickerData.priceChangePercent),
            high24h: parseFloat(tickerData.highPrice),
            low24h: parseFloat(tickerData.lowPrice),
            fundingRate: parseFloat(fundingData[0]?.fundingRate || 0) * 100,
            openInterest: parseFloat(openInterestData.openInterest),
            openInterestValue: parseFloat(openInterestData.openInterest) * parseFloat(tickerData.lastPrice),
            source: 'Binance Futures'
        };
    } catch (binanceError) {
        console.log(`❌ Binance unavailable: ${binanceError.message}`);
    }
    
    // Fallback to alternative data sources
    for (const source of DATA_SOURCES) {
        try {
            console.log(`📡 Trying ${source.name}...`);
            const url = source.getPriceUrl(symbol);
            const data = await makeApiCall(url);
            const parsed = source.parseData(data, symbol);
            console.log(`✅ ${source.name} data retrieved successfully`);
            return parsed;
        } catch (error) {
            console.log(`❌ ${source.name} failed: ${error.message}`);
        }
    }
    
    // If all sources fail, return null
    console.log('❌ All data sources unavailable. Please check your internet connection.');
    return null;
}

// Enhanced sentiment analysis
function analyzeFuturesSentiment(data) {
    const sentiment = {
        overall: 'NEUTRAL',
        signals: [],
        score: 0,
        confidence: 'LOW'
    };
    
    // Price momentum analysis
    if (data.priceChange24h > 10) {
        sentiment.signals.push('🚀 Strong bullish momentum (+10%+)');
        sentiment.score += 30;
    } else if (data.priceChange24h > 5) {
        sentiment.signals.push('📈 Moderate bullish momentum (+5%+)');
        sentiment.score += 15;
    } else if (data.priceChange24h < -10) {
        sentiment.signals.push('📉 Strong bearish momentum (-10%+)');
        sentiment.score -= 30;
    } else if (data.priceChange24h < -5) {
        sentiment.signals.push('📉 Moderate bearish momentum (-5%+)');
        sentiment.score -= 15;
    } else {
        sentiment.signals.push('➡️ Sideways price action');
    }
    
    // Funding rate analysis (if available)
    if (data.fundingRate !== 0) {
        if (data.fundingRate > 0.1) {
            sentiment.signals.push('🔴 High positive funding - longs paying shorts (bearish signal)');
            sentiment.score -= 20;
        } else if (data.fundingRate < -0.05) {
            sentiment.signals.push('🟢 Negative funding - shorts paying longs (bullish signal)');
            sentiment.score += 20;
        } else if (Math.abs(data.fundingRate) < 0.01) {
            sentiment.signals.push('🟡 Neutral funding rate');
        }
    } else {
        sentiment.signals.push('ℹ️ Funding rate data unavailable');
    }
    
    // Volume analysis
    if (data.volume24h > 0) {
        const volumeInMillions = data.volume24h / 1000000;
        if (volumeInMillions > 100) {
            sentiment.signals.push('💪 High volume (institutional interest)');
            sentiment.score += 10;
        } else if (volumeInMillions < 10) {
            sentiment.signals.push('⚠️ Low volume (reduced liquidity)');
            sentiment.score -= 10;
        }
    }
    
    // Open Interest analysis (if available)
    if (data.openInterestValue > 0) {
        const oiInMillions = data.openInterestValue / 1000000;
        if (oiInMillions > 100) {
            sentiment.signals.push('🔥 High open interest (strong conviction)');
            sentiment.score += 15;
        } else if (oiInMillions < 10) {
            sentiment.signals.push('💤 Low open interest (low conviction)');
            sentiment.score -= 5;
        }
    }
    
    // Determine overall sentiment and confidence
    if (sentiment.score > 30) {
        sentiment.overall = 'BULLISH';
        sentiment.confidence = sentiment.score > 50 ? 'HIGH' : 'MEDIUM';
    } else if (sentiment.score < -30) {
        sentiment.overall = 'BEARISH';
        sentiment.confidence = Math.abs(sentiment.score) > 50 ? 'HIGH' : 'MEDIUM';
    } else {
        sentiment.overall = 'NEUTRAL';
        sentiment.confidence = 'LOW';
    }
    
    return sentiment;
}

// Enhanced support/resistance calculation
function calculateSupportResistance(data) {
    const currentPrice = data.price;
    const high24h = data.high24h;
    const low24h = data.low24h;
    const range = high24h - low24h;
    
    const levels = [];
    
    // Key 24h levels
    levels.push(
        { level: low24h, type: 'Support', strength: 'Strong', reason: '24h Low', distance: ((low24h - currentPrice) / currentPrice * 100).toFixed(2) },
        { level: high24h, type: 'Resistance', strength: 'Strong', reason: '24h High', distance: ((high24h - currentPrice) / currentPrice * 100).toFixed(2) }
    );
    
    // Psychological levels (round numbers)
    const roundLevels = [
        Math.floor(currentPrice / 100) * 100,
        Math.ceil(currentPrice / 100) * 100,
        Math.floor(currentPrice / 50) * 50,
        Math.ceil(currentPrice / 50) * 50,
        Math.floor(currentPrice / 10) * 10,
        Math.ceil(currentPrice / 10) * 10
    ].filter(level => level !== currentPrice && Math.abs(level - currentPrice) / currentPrice < 0.2);
    
    roundLevels.forEach(level => {
        levels.push({
            level: level,
            type: level > currentPrice ? 'Resistance' : 'Support',
            strength: 'Medium',
            reason: `Psychological Level ($${level})`,
            distance: ((level - currentPrice) / currentPrice * 100).toFixed(2)
        });
    });
    
    // Fibonacci-like levels
    if (range > 0) {
        const fibLevels = [
            { ratio: 0.236, name: 'Fib 23.6%' },
            { ratio: 0.382, name: 'Fib 38.2%' },
            { ratio: 0.618, name: 'Fib 61.8%' },
            { ratio: 0.786, name: 'Fib 78.6%' }
        ];
        
        fibLevels.forEach(fib => {
            const level = low24h + (range * fib.ratio);
            levels.push({
                level: level,
                type: level > currentPrice ? 'Resistance' : 'Support',
                strength: 'Medium',
                reason: fib.name,
                distance: ((level - currentPrice) / currentPrice * 100).toFixed(2)
            });
        });
    }
    
    // Remove duplicates and sort by distance from current price
    const uniqueLevels = levels.filter((level, index, self) => 
        index === self.findIndex(l => Math.abs(l.level - level.level) < currentPrice * 0.005)
    );
    
    return uniqueLevels
        .sort((a, b) => Math.abs(a.level - currentPrice) - Math.abs(b.level - currentPrice))
        .slice(0, 6);
}

// Enhanced trading recommendations
function generateTradingRecommendations(data, sentiment, levels) {
    const recommendations = [];
    const currentPrice = data.price;
    
    // Only generate recommendations for medium+ confidence
    if (sentiment.confidence === 'LOW') {
        return [{
            message: '⏳ Market conditions unclear. Wait for better setup.',
            confidence: 'LOW'
        }];
    }
    
    const nearestSupport = levels.find(l => l.type === 'Support' && l.level < currentPrice);
    const nearestResistance = levels.find(l => l.type === 'Resistance' && l.level > currentPrice);
    
    // Long setup for bullish sentiment
    if (sentiment.overall === 'BULLISH' && nearestSupport && nearestResistance) {
        const stopDistance = currentPrice - nearestSupport.level;
        const targetDistance = nearestResistance.level - currentPrice;
        const riskReward = targetDistance / stopDistance;
        
        if (riskReward > 1.5) {
            recommendations.push({
                direction: 'LONG',
                entry: currentPrice * 0.999,
                stopLoss: nearestSupport.level * 0.99,
                takeProfit: nearestResistance.level * 0.99,
                leverage: sentiment.confidence === 'HIGH' ? 10 : 5,
                riskReward: riskReward.toFixed(2),
                confidence: sentiment.confidence,
                reasoning: `Bullish sentiment (${sentiment.score}) + good R:R ratio`
            });
        }
    }
    
    // Short setup for bearish sentiment
    if (sentiment.overall === 'BEARISH' && nearestSupport && nearestResistance) {
        const stopDistance = nearestResistance.level - currentPrice;
        const targetDistance = currentPrice - nearestSupport.level;
        const riskReward = targetDistance / stopDistance;
        
        if (riskReward > 1.5) {
            recommendations.push({
                direction: 'SHORT',
                entry: currentPrice * 1.001,
                stopLoss: nearestResistance.level * 1.01,
                takeProfit: nearestSupport.level * 1.01,
                leverage: sentiment.confidence === 'HIGH' ? 10 : 5,
                riskReward: riskReward.toFixed(2),
                confidence: sentiment.confidence,
                reasoning: `Bearish sentiment (${sentiment.score}) + good R:R ratio`
            });
        }
    }
    
    return recommendations;
}

// Calculate position sizing for small portfolio
function calculateSmallPortfolioSize(recommendation, portfolioSize = 80) {
    if (!recommendation.entry) return null;
    
    const riskPercent = 0.05; // Risk 5% per trade
    const maxRisk = portfolioSize * riskPercent;
    
    const entryPrice = recommendation.entry;
    const stopLoss = recommendation.stopLoss;
    const leverage = recommendation.leverage;
    
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    const maxUnits = maxRisk / riskPerUnit;
    const notionalValue = maxUnits * entryPrice;
    const requiredMargin = notionalValue / leverage;
    
    return {
        portfolioSize: portfolioSize,
        riskAmount: maxRisk,
        notionalValue: Math.min(notionalValue, portfolioSize * 0.5), // Max 50% of portfolio
        requiredMargin: Math.min(requiredMargin, portfolioSize * 0.2), // Max 20% margin
        units: maxUnits,
        marginPercent: (requiredMargin / portfolioSize * 100).toFixed(1)
    };
}

// Enhanced display function
function displayFuturesAnalysis(data, sentiment, levels, recommendations) {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 CLICKSHIFT FUTURES ANALYSIS REPORT');
    console.log('='.repeat(70));
    
    // Data source info
    console.log(`📡 Data Source: ${data.source}`);
    console.log(`⏰ Analysis Time: ${new Date().toLocaleString()}`);
    
    // Market overview
    console.log(`\n📊 ${data.symbol}/USDT MARKET DATA`);
    console.log(`💰 Current Price: $${data.price.toFixed(4)}`);
    console.log(`📈 24h Change: ${data.priceChange24h > 0 ? '+' : ''}${data.priceChange24h.toFixed(2)}%`);
    console.log(`📊 24h High: $${data.high24h.toFixed(4)}`);
    console.log(`📊 24h Low: $${data.low24h.toFixed(4)}`);
    
    if (data.volume24h > 0) {
        console.log(`🔄 24h Volume: $${(data.volume24h / 1000000).toFixed(1)}M`);
    }
    
    if (data.fundingRate !== 0) {
        console.log(`💸 Funding Rate: ${data.fundingRate > 0 ? '+' : ''}${data.fundingRate.toFixed(4)}%`);
    }
    
    if (data.openInterestValue > 0) {
        console.log(`🔄 Open Interest: $${(data.openInterestValue / 1000000).toFixed(1)}M`);
    }
    
    // Market sentiment
    console.log(`\n🎯 MARKET SENTIMENT: ${sentiment.overall} (${sentiment.confidence} confidence)`);
    console.log(`📊 Sentiment Score: ${sentiment.score}/100`);
    sentiment.signals.forEach(signal => console.log(`  ${signal}`));
    
    // Key levels
    console.log('\n📊 KEY PRICE LEVELS:');
    levels.forEach(level => {
        const arrow = parseFloat(level.distance) > 0 ? '⬆️' : '⬇️';
        console.log(`  ${level.type}: $${level.level.toFixed(4)} ${arrow} ${level.distance}% - ${level.reason}`);
    });
    
    // Trading recommendations
    console.log('\n💡 TRADING RECOMMENDATIONS:');
    if (recommendations.length === 0 || recommendations[0].message) {
        console.log('  ⏳ No clear trading opportunities at the moment.');
        console.log('  💡 Wait for higher confidence signals or better risk/reward setups.');
    } else {
        recommendations.forEach((rec, index) => {
            console.log(`\n  ${index + 1}. ${rec.direction} SETUP (${rec.confidence} confidence)`);
            console.log(`     📍 Entry: $${rec.entry.toFixed(4)}`);
            console.log(`     🛑 Stop Loss: $${rec.stopLoss.toFixed(4)}`);
            console.log(`     🎯 Take Profit: $${rec.takeProfit.toFixed(4)}`);
            console.log(`     📊 Leverage: ${rec.leverage}x`);
            console.log(`     ⚖️ Risk:Reward = 1:${rec.riskReward}`);
            console.log(`     💭 Reasoning: ${rec.reasoning}`);
            
            // Position sizing for $80 portfolio
            const sizing = calculateSmallPortfolioSize(rec, 80);
            if (sizing) {
                console.log(`\n     💰 POSITION SIZE ($80 portfolio):`);
                console.log(`     • Risk per trade: $${sizing.riskAmount.toFixed(2)} (5%)`);
                console.log(`     • Notional position: $${sizing.notionalValue.toFixed(2)}`);
                console.log(`     • Required margin: $${sizing.requiredMargin.toFixed(2)} (${sizing.marginPercent}%)`);
            }
        });
    }
    
    // Timing warning
    console.log('\n⏰ TIMING CONSIDERATIONS:');
    console.log('  • This analysis is valid for 15-30 minutes');
    console.log('  • Re-run analyzer before entering positions');
    console.log('  • Market conditions can change rapidly');
    
    // Risk warnings
    console.log('\n⚠️ RISK MANAGEMENT:');
    console.log('  • Never risk more than 5% per trade');
    console.log('  • Always use stop losses');
    console.log('  • Start with smaller positions');
    console.log('  • Keep 70%+ of portfolio in reserve');
    
    console.log('\n' + '='.repeat(70));
}

// Main analysis function
async function analyzeFutures(symbol) {
    try {
        const data = await getFuturesData(symbol);
        if (!data) {
            console.log('❌ Unable to fetch market data. Please try again later.');
            return;
        }
        
        const sentiment = analyzeFuturesSentiment(data);
        const levels = calculateSupportResistance(data);
        const recommendations = generateTradingRecommendations(data, sentiment, levels);
        
        displayFuturesAnalysis(data, sentiment, levels, recommendations);
        
        return { data, sentiment, levels, recommendations };
    } catch (error) {
        console.error('❌ Analysis failed:', error.message);
    }
}

// Interactive menu
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function showFuturesMenu() {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 CLICKSHIFT ROBUST FUTURES ANALYZER');
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

function startFuturesApp() {
    console.log('🎉 Welcome to ClickShift Robust Futures Analyzer!');
    console.log('💡 Multiple data sources for reliable analysis');
    console.log('📊 Optimized for small portfolios ($80-$500)');
    showFuturesMenuAndWait();
}

// Export for use
module.exports = { analyzeFutures };

// Run if called directly
if (require.main === module) {
    startFuturesApp();
}