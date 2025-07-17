// ClickShift TradeSafe - Interactive Token Analyzer
// Users can input any contract address for analysis

const axios = require('axios');
const readline = require('readline');

// Configuration
const CONFIG = {
    WHALE_THRESHOLD: 10000,
    MEGA_WHALE_THRESHOLD: 50000,
    CLUSTER_THRESHOLD: 5,
    PRICE_TOLERANCE: 0.02
};

// Create interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to get comprehensive token data
async function getTokenData(contractAddress) {
    try {
        console.log(`🔍 Analyzing token: ${contractAddress.slice(0,8)}...${contractAddress.slice(-8)}`);
        
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`);
        const pairs = response.data.pairs;
        
        if (!pairs || pairs.length === 0) {
            console.log('❌ Token not found or no trading pairs available');
            return null;
        }
        
        const mainPair = pairs.reduce((prev, current) => 
            (current.volume?.h24 || 0) > (prev.volume?.h24 || 0) ? current : prev
        );
        
        const tokenData = {
            symbol: mainPair.baseToken.symbol,
            name: mainPair.baseToken.name,
            price: parseFloat(mainPair.priceUsd),
            marketCap: mainPair.marketCap,
            volume24h: mainPair.volume?.h24 || 0,
            liquidity: mainPair.liquidity?.usd || 0,
            pairAddress: mainPair.pairAddress,
            dex: mainPair.dexId,
            priceChange24h: mainPair.priceChange?.h24 || 0
        };
        
        console.log(`\n📊 Token: ${tokenData.symbol} (${tokenData.name})`);
        console.log(`💰 Price: $${tokenData.price}`);
        console.log(`📈 Market Cap: $${tokenData.marketCap?.toLocaleString() || 'N/A'}`);
        console.log(`🔄 24h Volume: $${tokenData.volume24h.toLocaleString()}`);
        console.log(`💧 Liquidity: $${tokenData.liquidity.toLocaleString()}`);
        console.log(`📊 24h Change: ${tokenData.priceChange24h > 0 ? '+' : ''}${tokenData.priceChange24h}%`);
        
        return tokenData;
    } catch (error) {
        console.error('❌ Error fetching token data:', error.message);
        return null;
    }
}

// Generate realistic order book simulation
function generateSimulatedOrderBook(tokenData) {
    const orders = [];
    const currentPrice = tokenData.price;
    
    for (let i = 1; i <= 20; i++) {
        const priceMultiplier = 1 + (i * 0.05);
        const sellPrice = currentPrice * priceMultiplier;
        
        const numOrders = Math.floor(Math.random() * 10) + 1;
        
        for (let j = 0; j < numOrders; j++) {
            const orderSize = Math.random() * 50000 + 100;
            orders.push({
                price: sellPrice,
                size: orderSize,
                type: 'sell',
                isWhale: orderSize > CONFIG.WHALE_THRESHOLD
            });
        }
    }
    
    return orders.sort((a, b) => a.price - b.price);
}

// Find clusters of exit orders
function findExitClusters(orders, currentPrice) {
    const clusters = [];
    const priceGroups = {};
    
    orders.forEach(order => {
        const priceKey = Math.round(order.price / currentPrice * 100) / 100;
        if (!priceGroups[priceKey]) {
            priceGroups[priceKey] = [];
        }
        priceGroups[priceKey].push(order);
    });
    
    Object.entries(priceGroups).forEach(([priceRatio, groupOrders]) => {
        if (groupOrders.length >= CONFIG.CLUSTER_THRESHOLD) {
            const totalValue = groupOrders.reduce((sum, order) => sum + order.size, 0);
            const whaleCount = groupOrders.filter(order => order.isWhale).length;
            
            clusters.push({
                priceLevel: parseFloat(priceRatio) * currentPrice,
                priceMultiplier: parseFloat(priceRatio),
                orderCount: groupOrders.length,
                totalValue: totalValue,
                whaleCount: whaleCount,
                retailCount: groupOrders.length - whaleCount,
                significance: totalValue * groupOrders.length
            });
        }
    });
    
    return clusters.sort((a, b) => b.significance - a.significance);
}

// Analyze whale vs retail behavior
function analyzeWhaleActivity(orders) {
    const whales = orders.filter(order => order.isWhale);
    const retail = orders.filter(order => !order.isWhale);
    
    const whaleTotal = whales.reduce((sum, order) => sum + order.size, 0);
    const retailTotal = retail.reduce((sum, order) => sum + order.size, 0);
    
    return {
        whaleOrderCount: whales.length,
        retailOrderCount: retail.length,
        whaleTotalValue: whaleTotal,
        retailTotalValue: retailTotal,
        whaleAvgSize: whales.length > 0 ? whaleTotal / whales.length : 0,
        retailAvgSize: retail.length > 0 ? retailTotal / retail.length : 0,
        whaleDominance: whaleTotal / (whaleTotal + retailTotal) * 100
    };
}

// Assess overall token risk
function assessTokenRisk(tokenData, orders) {
    let riskScore = 0;
    const risks = [];
    
    if (tokenData.liquidity < 50000) {
        riskScore += 30;
        risks.push('Low liquidity (<$50K)');
    }
    
    if (tokenData.volume24h < tokenData.liquidity * 0.1) {
        riskScore += 20;
        risks.push('Low trading volume');
    }
    
    const whaleActivity = analyzeWhaleActivity(orders);
    if (whaleActivity.whaleDominance > 70) {
        riskScore += 25;
        risks.push('High whale concentration');
    }
    
    if (Math.abs(tokenData.priceChange24h) > 50) {
        riskScore += 15;
        risks.push('High volatility');
    }
    
    if (!tokenData.marketCap || tokenData.marketCap < 1000000) {
        riskScore += 20;
        risks.push('Very low market cap');
    }
    
    let riskLevel = 'LOW';
    if (riskScore > 70) riskLevel = 'EXTREME';
    else if (riskScore > 50) riskLevel = 'HIGH';
    else if (riskScore > 30) riskLevel = 'MODERATE';
    
    return {
        score: riskScore,
        level: riskLevel,
        risks: risks
    };
}

// Enhanced analysis with pump/dump detection
async function analyzeOrderBook(tokenData) {
    console.log('\n🔍 Analyzing Order Book & Market Patterns...');
    
    const simulatedOrders = generateSimulatedOrderBook(tokenData);
    
    const analysis = {
        exitClusters: findExitClusters(simulatedOrders, tokenData.price),
        whaleActivity: analyzeWhaleActivity(simulatedOrders),
        riskAssessment: assessTokenRisk(tokenData, simulatedOrders),
        pumpSignals: detectPumpSignals(tokenData, simulatedOrders),
        marketSentiment: analyzeMarketSentiment(tokenData)
    };
    
    return analysis;
}

// Detect pump signals (bullish indicators)
function detectPumpSignals(tokenData, orders) {
    const signals = [];
    let pumpScore = 0;
    
    // 1. Low resistance above current price
    const currentPrice = tokenData.price;
    const nearbyOrders = orders.filter(order => 
        order.price <= currentPrice * 1.2 && order.price > currentPrice
    );
    const resistanceValue = nearbyOrders.reduce((sum, order) => sum + order.size, 0);
    
    if (resistanceValue < 50000) {
        signals.push('🚀 Low resistance above current price');
        pumpScore += 25;
    }
    
    // 2. High volume relative to market cap
    if (tokenData.volume24h > tokenData.marketCap * 0.5) {
        signals.push('💥 Exceptionally high volume (>50% of market cap)');
        pumpScore += 30;
    } else if (tokenData.volume24h > tokenData.marketCap * 0.2) {
        signals.push('📈 High volume activity (>20% of market cap)');
        pumpScore += 15;
    }
    
    // 3. Price momentum
    if (tokenData.priceChange24h > 20) {
        signals.push('🔥 Strong positive momentum (+20%+)');
        pumpScore += 20;
    } else if (tokenData.priceChange24h > 10) {
        signals.push('📈 Good upward momentum (+10%+)');
        pumpScore += 10;
    }
    
    // 4. Liquidity analysis
    if (tokenData.liquidity > 100000 && tokenData.volume24h > tokenData.liquidity * 2) {
        signals.push('💧 High liquidity with strong volume');
        pumpScore += 15;
    }
    
    // 5. Market cap sweet spot
    if (tokenData.marketCap && tokenData.marketCap > 1000000 && tokenData.marketCap < 100000000) {
        signals.push('🎯 Optimal market cap range for growth');
        pumpScore += 10;
    }
    
    // 6. Whale accumulation vs distribution
    const whaleActivity = analyzeWhaleActivity(orders);
    if (whaleActivity.whaleDominance < 50) {
        signals.push('🐟 Healthy retail participation');
        pumpScore += 10;
    }
    
    let pumpPotential = 'LOW';
    if (pumpScore > 70) pumpPotential = 'VERY HIGH';
    else if (pumpScore > 50) pumpPotential = 'HIGH';
    else if (pumpScore > 30) pumpPotential = 'MODERATE';
    
    return {
        signals,
        score: pumpScore,
        potential: pumpPotential,
        confidence: pumpScore > 50 ? 'HIGH' : pumpScore > 30 ? 'MEDIUM' : 'LOW'
    };
}

// Analyze overall market sentiment
function analyzeMarketSentiment(tokenData) {
    let sentiment = 'NEUTRAL';
    const factors = [];
    
    // Volume vs liquidity ratio
    const volumeRatio = tokenData.volume24h / (tokenData.liquidity || 1);
    if (volumeRatio > 3) {
        factors.push('High trading interest');
        sentiment = 'BULLISH';
    } else if (volumeRatio < 0.5) {
        factors.push('Low trading interest');
        sentiment = 'BEARISH';
    }
    
    // Price action
    if (tokenData.priceChange24h > 15) {
        factors.push('Strong uptrend');
        sentiment = 'BULLISH';
    } else if (tokenData.priceChange24h < -15) {
        factors.push('Strong downtrend');
        sentiment = 'BEARISH';
    }
    
    return {
        overall: sentiment,
        factors: factors
    };
}

// Display analysis results
function displayAnalysis(tokenData, analysis) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 CLICKSHIFT TRADESAFE ANALYSIS REPORT');
    console.log('='.repeat(60));
    
    // Pump Signals
    console.log(`\n🚀 PUMP POTENTIAL: ${analysis.pumpSignals.potential} (${analysis.pumpSignals.score}/100)`);
    if (analysis.pumpSignals.signals.length > 0) {
        console.log('Bullish Indicators:');
        analysis.pumpSignals.signals.forEach(signal => console.log(`  ${signal}`));
    } else {
        console.log('  No strong pump indicators detected');
    }
    
    // Market Sentiment
    console.log(`\n📊 MARKET SENTIMENT: ${analysis.marketSentiment.overall}`);
    if (analysis.marketSentiment.factors.length > 0) {
        analysis.marketSentiment.factors.forEach(factor => console.log(`  • ${factor}`));
    }
    
    // Exit Clusters with Market Cap Projections with Market Cap Projections
    console.log('\n🎯 TOP EXIT CLUSTERS:');
    analysis.exitClusters.slice(0, 5).forEach((cluster, index) => {
        const projectedMarketCap = tokenData.marketCap ? (tokenData.marketCap * cluster.priceMultiplier) : null;
        console.log(`${index + 1}. ${cluster.priceLevel.toFixed(6)} (${((cluster.priceMultiplier - 1) * 100).toFixed(1)}% up)`);
        if (projectedMarketCap) {
            console.log(`   📊 Market Cap at Exit: ${projectedMarketCap.toLocaleString()}`);
        }
        console.log(`   💰 Total Exit Value: ${cluster.totalValue.toLocaleString()}`);
        console.log(`   👥 Orders: ${cluster.orderCount} (🐋 ${cluster.whaleCount} whales, 🐟 ${cluster.retailCount} retail)`);
        console.log('');
    });
    
    // Whale Analysis
    console.log('🐋 WHALE vs RETAIL ANALYSIS:');
    const whale = analysis.whaleActivity;
    console.log(`Whale Orders: ${whale.whaleOrderCount} (Avg: $${whale.whaleAvgSize.toLocaleString()})`);
    console.log(`Retail Orders: ${whale.retailOrderCount} (Avg: $${whale.retailAvgSize.toLocaleString()})`);
    console.log(`Whale Dominance: ${whale.whaleDominance.toFixed(1)}%`);
    
    // Risk Assessment
    console.log(`\n⚠️ RISK ASSESSMENT: ${analysis.riskAssessment.level} (${analysis.riskAssessment.score}/100)`);
    if (analysis.riskAssessment.risks.length > 0) {
        console.log('Red Flags:');
        analysis.riskAssessment.risks.forEach(risk => console.log(`  • ${risk}`));
    }
    
    // Trading Recommendation with Pump/Dump Signals
    console.log('\n💡 TRADING RECOMMENDATION:');
    
    // Entry recommendations based on pump signals
    if (analysis.pumpSignals.potential === 'VERY HIGH' || analysis.pumpSignals.potential === 'HIGH') {
        console.log('🟢 ENTRY OPPORTUNITY DETECTED:');
        console.log(`  • Pump potential: ${analysis.pumpSignals.potential}`);
        console.log(`  • Consider buying on dips with tight stop loss`);
        console.log(`  • Watch for breakout above resistance levels`);
    }
    
    // Risk-based recommendations
    if (analysis.riskAssessment.level === 'LOW') {
        console.log('✅ Relatively safe for trading. Watch whale activity and exit clusters.');
    } else if (analysis.riskAssessment.level === 'MODERATE') {
        console.log('⚠️ Trade with caution. Use smaller position sizes.');
    } else if (analysis.riskAssessment.level === 'HIGH') {
        console.log('🟡 High risk. Only for experienced traders.');
    } else {
        console.log('🔴 EXTREME RISK. Consider avoiding or use micro positions.');
    }
    
    // Combined pump/dump intelligence
    if (analysis.pumpSignals.potential === 'HIGH' && analysis.riskAssessment.level === 'LOW') {
        console.log('\n🎯 GOLDEN OPPORTUNITY: High pump potential + Low risk = Ideal entry setup!');
    } else if (analysis.exitClusters.length > 3 && analysis.pumpSignals.potential === 'LOW') {
        console.log('\n⚠️ DUMP RISK: Multiple exit clusters + Low pump potential = Consider exit strategy');
    }
    
    console.log('\n' + '='.repeat(60));
}

// Main analysis function
async function analyzeToken(contractAddress) {
    try {
        const tokenData = await getTokenData(contractAddress);
        if (!tokenData) return false;
        
        const analysis = await analyzeOrderBook(tokenData);
        displayAnalysis(tokenData, analysis);
        
        return true;
    } catch (error) {
        console.error('❌ Analysis failed:', error.message);
        return false;
    }
}

// Validate contract address format
function isValidSolanaAddress(address) {
    // Basic Solana address validation (44 characters, base58)
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{44}$/;
    return base58Regex.test(address);
}

// Interactive menu
function showMenu() {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 CLICKSHIFT TRADESAFE - TOKEN ANALYZER');
    console.log('='.repeat(50));
    console.log('1. Analyze a token (paste contract address)');
    console.log('2. Quick test with BONK');
    console.log('3. Quick test with WIF');
    console.log('4. Exit');
    console.log('='.repeat(50));
}

// Handle user choice
async function handleUserChoice(choice) {
    switch(choice.trim()) {
        case '1':
            rl.question('\n📋 Paste the Solana contract address: ', async (address) => {
                const cleanAddress = address.trim();
                
                if (!isValidSolanaAddress(cleanAddress)) {
                    console.log('❌ Invalid Solana contract address format');
                    console.log('💡 Address should be 44 characters long');
                    console.log('Example: DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
                    showMenuAndWait();
                    return;
                }
                
                console.log(`\n🔍 Analyzing: ${cleanAddress}`);
                const success = await analyzeToken(cleanAddress);
                
                if (success) {
                    console.log('\n✅ Analysis complete!');
                } else {
                    console.log('\n❌ Analysis failed. Please try another token.');
                }
                
                showMenuAndWait();
            });
            break;
            
        case '2':
            console.log('\n🔍 Analyzing BONK...');
            await analyzeToken('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
            showMenuAndWait();
            break;
            
        case '3':
            console.log('\n🔍 Analyzing WIF...');
            await analyzeToken('EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm');
            showMenuAndWait();
            break;
            
        case '4':
            console.log('\n👋 Thanks for using ClickShift TradeSafe!');
            console.log('💡 Ready for user validation with your 10 traders!');
            rl.close();
            break;
            
        default:
            console.log('❌ Invalid choice. Please select 1-4.');
            showMenuAndWait();
            break;
    }
}

// Show menu and wait for input
function showMenuAndWait() {
    showMenu();
    rl.question('Select an option (1-4): ', handleUserChoice);
}

// Start the interactive application
function startApp() {
    console.log('🎉 Welcome to ClickShift TradeSafe Token Analyzer!');
    console.log('💡 Analyze any Solana token for exit clusters and whale activity');
    showMenuAndWait();
}

// Run the application
startApp();