// Your first script to test Solana order book data
// Copy this entire code into your order-book-test.js file

// Your first script to test Solana order book data
// Copy this entire code into your order-book-test.js file

const axios = require('axios');

// Function to get token price and basic info
async function getTokenInfo(tokenAddress) {
    try {
        console.log('🔍 Fetching token information...');
        
        // Try multiple APIs for better success rate
        const apis = [
            `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
            `https://price.jup.ag/v4/price?ids=${tokenAddress}`
        ];
        
        for (const apiUrl of apis) {
            try {
                const response = await axios.get(apiUrl);
                
                if (apiUrl.includes('dexscreener')) {
                    const data = response.data.pairs?.[0];
                    if (data) {
                        console.log('\n📊 Token Information (DexScreener):');
                        console.log(`Price: ${data.priceUsd}`);
                        console.log(`Token: ${data.baseToken.symbol}`);
                        console.log(`Market Cap: ${data.marketCap ? data.marketCap.toLocaleString() : 'N/A'}`);
                        console.log('✅ Connection successful!');
                        return data;
                    }
                } else {
                    const priceData = response.data.data[tokenAddress];
                    if (priceData) {
                        console.log('\n📊 Token Information (Jupiter):');
                        console.log(`Price: ${priceData.price}`);
                        console.log(`Token: ${tokenAddress}`);
                        console.log('✅ Connection successful!');
                        return priceData;
                    }
                }
            } catch (apiError) {
                console.log(`⚠️ ${apiUrl.includes('dexscreener') ? 'DexScreener' : 'Jupiter'} API unavailable`);
                continue;
            }
        }
        
        console.log('❌ All APIs unavailable');
        return null;
    } catch (error) {
        console.error('❌ Error:', error.message);
        return null;
    }
}

// Function to get basic market data from Birdeye
async function getMarketData(tokenAddress) {
    try {
        console.log('\n🔍 Fetching market data...');
        
        const response = await axios.get(`https://public-api.birdeye.so/public/token_overview?address=${tokenAddress}`, {
            headers: {
                'X-API-KEY': 'your-api-key-here' // We'll get this free
            }
        });
        
        const data = response.data.data;
        if (data) {
            console.log('\n📈 Market Data:');
            console.log(`Market Cap: $${data.mc ? data.mc.toLocaleString() : 'N/A'}`);
            console.log(`Volume 24h: $${data.v24h ? data.v24h.toLocaleString() : 'N/A'}`);
            console.log(`Holders: ${data.holder ? data.holder.toLocaleString() : 'N/A'}`);
        }
        
        return data;
    } catch (error) {
        console.log('⚠️ Market data unavailable (need API key)');
        return null;
    }
}

// Test with popular tokens
async function testMultipleTokens() {
    console.log('🚀 Starting ClickShift TradeSafe Data Test\n');
    
    // Popular Solana tokens to test
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
        console.log(`\n${'='.repeat(50)}`);
        console.log(`Testing ${token.name}`);
        console.log(`${'='.repeat(50)}`);
        
        await getTokenInfo(token.address);
        await getMarketData(token.address);
        
        // Wait 1 second between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎉 Test completed! Your environment is ready.');
    console.log('Next step: We\'ll add order book analysis...');
}

// Run the test
testMultipleTokens();