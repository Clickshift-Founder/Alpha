// ClickShift TradeSafe - Dynamic Order Book Analyzer
// Analyzes ANY token by contract address

const axios = require('axios');

// Configuration - You can modify these thresholds
const CONFIG = {
    WHALE_THRESHOLD: 10000,      // $10K+ = whale transaction
    MEGA_WHALE_THRESHOLD: 50000, // $50K+ = mega whale
    CLUSTER_THRESHOLD: 5,        // 5+ orders at same price = cluster
    PRICE_TOLERANCE: 0.02        // 2% price range for clustering
};

// Function to get comprehensive token data
async function getTokenData(contractAddress) {
    try {
        console.log(`🔍 Analyzing token: ${contractAddress.slice(0,8)}...${contractAddress.slice(-8)}`);
        
        // Get basic token info from DexScreener
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`);
        const pairs = response.data.pairs;
        
        if (!pairs || pairs.length === 0) {
            console.log('❌ Token not found or no trading pairs available');
            return null;
        }
        
        // Get the most liquid pair (highest volume)
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

// Function to simulate order book analysis (will be real data later)
async function analyzeOrderBook(tokenData) {
    console.log('\n🔍 Analyzing Order Book & Exit Patterns...');
    
    // Simulate order book data - in real version, this will come from DEX APIs
    const simulatedOrders = generateSimulatedOrderBook(tokenData);
    
    const analysis = {
        exitClusters: findExitClusters(simulatedOrders, tokenData.price),
        whaleActivity: analyzeWhaleActivity(simulatedOrders),
        liquidityLevels: analyzeLiquidityLevels(simulatedOrders),
        riskAssessment: assessTokenRisk(tokenData, simulatedOrders)
    };
    
    return analysis;
}

// Generate realistic order book simulation
function generateSimulatedOrderBook(tokenData) {
    const orders = [];
    const currentPrice = tokenData.price;
    
    // Generate sell orders at various price levels
    for (let i = 1; i <= 20; i++) {
        const priceMultiplier = 1 + (i * 0.05); // 5%, 10%, 15%, etc. above current price
        const sellPrice = currentPrice * priceMultiplier;
        
        // Random number of orders at each level
        const numOrders = Math.floor(Math.random() * 10) + 1;
        
        for (let j = 0; j < numOrders; j++) {
            const orderSize = Math.random() * 50000 + 100; // $100 to $50,000
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
    
    // Group orders by similar price levels
    orders.forEach(order => {
        const priceKey = Math.round(order.price / currentPrice * 100) / 100; // Round to 2 decimals
        if (!priceGroups[priceKey]) {
            priceGroups[priceKey] = [];
        }
        priceGroups[priceKey].push(order);
    });
    
    // Find significant clusters
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
                significance: totalValue * groupOrders.length // Weight by both size and count
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

// Analyze liquidity at different price levels
function analyzeLiquidityLevels(orders) {
    const levels = [1.1, 1.2, 1.5, 2.0, 3.0, 5.0]; // 10%, 20%, 50%, 100%, 200%, 400% above current price
    
    return levels.map(multiplier => {
        const relevantOrders = orders.filter(order => 
            order.price <= orders[0].price * multiplier
        );
        
        const totalLiquidity = relevantOrders.reduce((sum, order) => sum + order.size, 0);
        
        return {
            priceLevel: `${(multiplier - 1) * 100}%`,
            liquidityDepth: totalLiquidity,
            orderCount: relevantOrders.length
        };
    });
}

// Assess overall token risk
function assessTokenRisk(tokenData, orders) {
    let riskScore = 0;
    const risks = [];
    
    // Low liquidity risk
    if (tokenData.liquidity < 50000) {
        riskScore += 30;
        risks.push('Low liquidity (<$50K)');
    }
    
    // Low volume risk
    if (tokenData.volume24h < tokenData.liquidity * 0.1) {
        riskScore += 20;
        risks.push('Low trading volume');
    }
    
    // Whale concentration risk
    const whaleActivity = analyzeWhaleActivity(orders);
    if (whaleActivity.whaleDominance > 70) {
        riskScore += 25;
        risks.push('High whale concentration');
    }
    
    // Price volatility risk
    if (Math.abs(tokenData.priceChange24h) > 50) {
        riskScore += 15;
        risks.push('High volatility');
    }
    
    // Market cap risk
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

// Display analysis results
function displayAnalysis(tokenData, analysis) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 CLICKSHIFT TRADESAFE ANALYSIS REPORT');
    console.log('='.repeat(60));
    
    // Exit Clusters
    console.log('\n🎯 TOP EXIT CLUSTERS:');
    analysis.exitClusters.slice(0, 5).forEach((cluster, index) => {
        console.log(`${index + 1}. $${cluster.priceLevel.toFixed(6)} (${((cluster.priceMultiplier - 1) * 100).toFixed(1)}% up)`);
        console.log(`   💰 Total Value: $${cluster.totalValue.toLocaleString()}`);
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
    
    // Trading Recommendation
    console.log('\n💡 TRADING RECOMMENDATION:');
    if (analysis.riskAssessment.level === 'LOW') {
        console.log('✅ Relatively safe for trading. Watch whale activity.');
    } else if (analysis.riskAssessment.level === 'MODERATE') {
        console.log('⚠️ Trade with caution. Use smaller position sizes.');
    } else if (analysis.riskAssessment.level === 'HIGH') {
        console.log('🟡 High risk. Only for experienced traders.');
    } else {
        console.log('🔴 EXTREME RISK. Consider avoiding or use micro positions.');
    }
    
    console.log('\n' + '='.repeat(60));
}

// Main analysis function
async function analyzeToken(contractAddress) {
    try {
        // Get token data
        const tokenData = await getTokenData(contractAddress);
        if (!tokenData) return;
        
        // Analyze order book
        const analysis = await analyzeOrderBook(tokenData);
        
        // Display results
        displayAnalysis(tokenData, analysis);
        
        return { tokenData, analysis };
    } catch (error) {
        console.error('❌ Analysis failed:', error.message);
    }
}

// Example usage with different tokens
async function runAnalysis() {
    console.log('🚀 ClickShift TradeSafe - Dynamic Token Analyzer\n');
    
    // Test with multiple tokens
    const testTokens = [
        {
            name: 'BONK',
            address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
        },
        {
            name: 'WIF', 
            address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'
        }
    ];
    
    for (const token of testTokens) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🔍 ANALYZING ${token.name}`);
        console.log(`Contract: ${token.address}`);
        console.log(`${'='.repeat(80)}`);
        
        await analyzeToken(token.address);
        
        // Wait between analyses
        console.log('\n⏳ Waiting 2 seconds before next analysis...');
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n🎉 Analysis complete! Ready for user input feature...');
    console.log('\n💡 Next: We\'ll add a feature where you can paste any contract address!');
}

// Run the analysis
runAnalysis();

// Export for future use
module.exports = { analyzeToken, CONFIG };