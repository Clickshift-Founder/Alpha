// ai-predictor.js - Machine Learning for Token Predictions

const tf = require('@tensorflow/tfjs-node'); // TensorFlow for ML
const brain = require('brain.js'); // Simple neural network

class ClickShiftAI {
    constructor() {
        this.neuralNetwork = new brain.NeuralNetwork();
        this.trainingData = [];
        this.model = null;
        this.accuracy = 0;
        this.loadTrainingData();
    }

    // Collect data from every analysis and outcome
    async collectDataPoint(tokenData, userAction, outcome) {
        const dataPoint = {
            // Input features
            input: {
                liquidity: this.normalize(tokenData.liquidity, 0, 1000000),
                volume: this.normalize(tokenData.volume, 0, 1000000),
                holders: this.normalize(tokenData.holders, 0, 10000),
                age: this.normalize(tokenData.age, 0, 86400000), // ms
                priceChange5m: this.normalize(tokenData.priceChange5m, -100, 100),
                buyPressure: tokenData.buys / (tokenData.sells || 1),
                socialScore: this.calculateSocialScore(tokenData),
                contractVerified: tokenData.verified ? 1 : 0,
                liquidityLocked: tokenData.liquidityLocked ? 1 : 0,
                mintRevoked: tokenData.mintRevoked ? 1 : 0
            },
            // Output (what happened)
            output: {
                pumped: outcome.pumped ? 1 : 0,
                rugged: outcome.rugged ? 1 : 0,
                return24h: this.normalize(outcome.return24h, -100, 1000)
            }
        };

        this.trainingData.push(dataPoint);
        
        // Retrain model every 100 new data points
        if (this.trainingData.length % 100 === 0) {
            await this.trainModel();
        }
        
        await this.saveTrainingData();
    }

    // Train the neural network
    async trainModel() {
        console.log('🧠 Training AI model with', this.trainingData.length, 'samples...');
        
        if (this.trainingData.length < 100) {
            console.log('Need more data for training (minimum 100 samples)');
            return;
        }

        // Split data: 80% training, 20% testing
        const splitIndex = Math.floor(this.trainingData.length * 0.8);
        const trainingSet = this.trainingData.slice(0, splitIndex);
        const testSet = this.trainingData.slice(splitIndex);

        // Train the network
        this.neuralNetwork.train(trainingSet, {
            iterations: 2000,
            errorThresh: 0.005,
            learningRate: 0.3,
            momentum: 0.1,
            log: true,
            logPeriod: 100
        });

        // Test accuracy
        let correct = 0;
        testSet.forEach(data => {
            const prediction = this.neuralNetwork.run(data.input);
            if (
                (prediction.pumped > 0.5 && data.output.pumped === 1) ||
                (prediction.rugged > 0.5 && data.output.rugged === 1)
            ) {
                correct++;
            }
        });

        this.accuracy = (correct / testSet.length) * 100;
        console.log(`✅ Model trained! Accuracy: ${this.accuracy.toFixed(1)}%`);

        // Save model
        await this.saveModel();
    }

    // Make predictions for new tokens
    async predict(tokenData) {
        if (!this.neuralNetwork || this.trainingData.length < 100) {
            return this.ruleBasedPrediction(tokenData); // Fallback
        }

        const input = {
            liquidity: this.normalize(tokenData.liquidity, 0, 1000000),
            volume: this.normalize(tokenData.volume, 0, 1000000),
            holders: this.normalize(tokenData.holders || 0, 0, 10000),
            age: this.normalize(Date.now() - tokenData.pairCreatedAt, 0, 86400000),
            priceChange5m: this.normalize(tokenData.priceChange?.m5 || 0, -100, 100),
            buyPressure: (tokenData.txns?.h24?.buys || 1) / (tokenData.txns?.h24?.sells || 1),
            socialScore: 0.5, // Default if unknown
            contractVerified: 0.5, // Default if unknown
            liquidityLocked: 0.5, // Default if unknown
            mintRevoked: 0.5 // Default if unknown
        };

        const prediction = this.neuralNetwork.run(input);

        return {
            pumpProbability: (prediction.pumped * 100).toFixed(1),
            rugProbability: (prediction.rugged * 100).toFixed(1),
            expectedReturn: this.denormalize(prediction.return24h, -100, 1000).toFixed(0),
            confidence: this.accuracy,
            recommendation: this.getRecommendation(prediction),
            exitPoints: this.predictExitPoints(tokenData, prediction)
        };
    }

    // Predict exit points based on patterns
    predictExitPoints(tokenData, prediction) {
        const basePrice = parseFloat(tokenData.priceUsd);
        
        // Use historical patterns to predict resistance levels
        const exitPoints = [];
        
        // Common psychological levels
        const multipliers = [1.5, 2, 3, 5, 10];
        
        multipliers.forEach(mult => {
            const probability = this.calculateExitProbability(mult, prediction);
            if (probability > 30) {
                exitPoints.push({
                    price: (basePrice * mult).toFixed(9),
                    gain: `+${((mult - 1) * 100).toFixed(0)}%`,
                    probability: `${probability}%`,
                    recommended: probability > 60
                });
            }
        });

        return exitPoints.slice(0, 3); // Top 3 exit points
    }

    calculateExitProbability(multiplier, prediction) {
        // Complex calculation based on historical data
        // Simplified version:
        const baseProbability = 100 - (multiplier * 10);
        const adjustedByPump = baseProbability * (prediction.pumped || 0.5);
        return Math.max(0, Math.min(100, adjustedByPump));
    }

    // Fallback rule-based prediction
    ruleBasedPrediction(tokenData) {
        let pumpScore = 50;
        let rugScore = 50;

        // Positive indicators
        if (tokenData.liquidity?.usd > 50000) pumpScore += 20;
        if (tokenData.volume?.h24 > 100000) pumpScore += 15;
        if (tokenData.txns?.h24?.buys > tokenData.txns?.h24?.sells) pumpScore += 10;
        
        // Negative indicators
        if (tokenData.liquidity?.usd < 5000) rugScore += 30;
        if (tokenData.pairCreatedAt && Date.now() - tokenData.pairCreatedAt < 300000) rugScore += 20;
        
        return {
            pumpProbability: Math.min(100, pumpScore),
            rugProbability: Math.min(100, rugScore),
            expectedReturn: pumpScore > rugScore ? '+100' : '-50',
            confidence: 60, // Lower confidence for rule-based
            recommendation: pumpScore > 70 ? 'BUY' : rugScore > 70 ? 'AVOID' : 'WAIT',
            exitPoints: []
        };
    }

    getRecommendation(prediction) {
        if (prediction.pumped > 0.7) return '🟢 STRONG BUY';
        if (prediction.pumped > 0.5) return '🟡 BUY';
        if (prediction.rugged > 0.7) return '🔴 AVOID';
        if (prediction.rugged > 0.5) return '🟠 HIGH RISK';
        return '⚪ WAIT';
    }

    // Learn from user feedback
    async learnFromFeedback(tokenAddress, feedback) {
        // User says prediction was right/wrong
        const outcome = {
            pumped: feedback === 'pumped',
            rugged: feedback === 'rugged',
            return24h: feedback.return || 0
        };

        // Find original token data
        const tokenData = await this.getTokenData(tokenAddress);
        
        // Add to training data
        await this.collectDataPoint(tokenData, feedback.userAction, outcome);
    }

    // Utility functions
    normalize(value, min, max) {
        return (value - min) / (max - min);
    }

    denormalize(value, min, max) {
        return value * (max - min) + min;
    }

    calculateSocialScore(tokenData) {
        // Calculate based on social signals
        let score = 0.5;
        if (tokenData.twitter) score += 0.2;
        if (tokenData.telegram) score += 0.2;
        if (tokenData.website) score += 0.1;
        return score;
    }

    async saveModel() {
        const modelJson = JSON.stringify(this.neuralNetwork.toJSON());
        await fs.writeFile('ai_model.json', modelJson);
        console.log('💾 AI model saved');
    }

    async loadModel() {
        try {
            const modelJson = await fs.readFile('ai_model.json', 'utf8');
            this.neuralNetwork.fromJSON(JSON.parse(modelJson));
            console.log('🧠 AI model loaded');
        } catch (error) {
            console.log('No existing model found, will train new one');
        }
    }

    async saveTrainingData() {
        await fs.writeFile('training_data.json', JSON.stringify(this.trainingData));
    }

    async loadTrainingData() {
        try {
            const data = await fs.readFile('training_data.json', 'utf8');
            this.trainingData = JSON.parse(data);
            console.log(`📊 Loaded ${this.trainingData.length} training samples`);
            
            if (this.trainingData.length >= 100) {
                await this.loadModel();
            }
        } catch (error) {
            console.log('Starting fresh AI training');
        }
    }
}

// Initialize AI
const clickshiftAI = new ClickShiftAI();

// Integrate with your main bot
// After each alert, track the outcome
// After each analysis, make prediction

// Add to your analyze function:
async function enhancedAnalysis(tokenData) {
    const aiPrediction = await clickshiftAI.predict(tokenData);
    
    // Add to your alert message
    const aiSection = `
🤖 *AI Prediction:*
• Pump Probability: ${aiPrediction.pumpProbability}%
• Rug Risk: ${aiPrediction.rugProbability}%
• Expected 24h: ${aiPrediction.expectedReturn}%
• Recommendation: ${aiPrediction.recommendation}

📊 *Predicted Exit Points:*
${aiPrediction.exitPoints.map(ep => 
    `• ${ep.gain}: ${ep.probability} chance ${ep.recommended ? '⭐' : ''}`
).join('\n')}

🎯 AI Confidence: ${aiPrediction.confidence}%`;
    
    return aiSection;
}

module.exports = { ClickShiftAI, clickshiftAI };