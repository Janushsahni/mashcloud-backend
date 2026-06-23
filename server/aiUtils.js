const axios = require('axios');

// Environment variables for Hyperspace Node
const HYPERSPACE_BASE_URL = process.env.HYPERSPACE_URL || 'http://localhost:8000/v1';
const HYPERSPACE_VISION_MODEL = process.env.HYPERSPACE_VISION_MODEL || 'local-vision-model';
const HYPERSPACE_TEXT_MODEL = process.env.HYPERSPACE_TEXT_MODEL || 'local-text-model';
const HYPERSPACE_API_KEY = process.env.HYPERSPACE_API_KEY || '';
// Limit concurrent AI requests to avoid overwhelming the node or GPU
const MAX_CONCURRENT_AI_TASKS = parseInt(process.env.MAX_CONCURRENT_AI_TASKS || '2', 10);

let pipeline = null;
let imageClassifier = null;
let textSummarizer = null;

// Concurrency Queue to prevent bottlenecking the AI node
class AsyncQueue {
    constructor(concurrency) {
        this.concurrency = concurrency;
        this.activeCount = 0;
        this.queue = [];
    }

    async enqueue(taskFn) {
        if (this.activeCount >= this.concurrency) {
            await new Promise(resolve => this.queue.push(resolve));
        }
        this.activeCount++;
        try {
            return await taskFn();
        } finally {
            this.activeCount--;
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                next();
            }
        }
    }
}

const aiQueue = new AsyncQueue(MAX_CONCURRENT_AI_TASKS);

// Dynamic import for ES module in CommonJS wrapper (Fallback)
async function getPipeline() {
    if (!pipeline) {
        const transformers = await import('@xenova/transformers');
        pipeline = transformers.pipeline;
        transformers.env.cacheDir = './.cache';
    }
    return pipeline;
}

async function getImageClassifier() {
    if (!imageClassifier) {
        const pipe = await getPipeline();
        console.log("Loading fallback image classification model...");
        imageClassifier = await pipe('image-classification', 'Xenova/mobilenet_v2_1.0_224');
        console.log("Fallback image classification model loaded.");
    }
    return imageClassifier;
}

async function getTextSummarizer() {
    if (!textSummarizer) {
        const pipe = await getPipeline();
        console.log("Loading fallback summarization model...");
        textSummarizer = await pipe('summarization', 'Xenova/distilbart-cnn-6-6');
        console.log("Fallback summarization model loaded.");
    }
    return textSummarizer;
}

/**
 * Generate tags from a base64 image
 * Uses Hyperspace AI node first, falls back to local transformers if unavailable.
 * @param {string} base64Data - The base64 data URL of the image
 */
async function generateImageTags(base64Data) {
    return aiQueue.enqueue(async () => {
        try {
            const headers = {};
            if (HYPERSPACE_API_KEY) {
                headers['Authorization'] = `Bearer ${HYPERSPACE_API_KEY}`;
            }

            // Attempt Hyperspace AI first
            const response = await axios.post(`${HYPERSPACE_BASE_URL}/chat/completions`, {
                model: HYPERSPACE_VISION_MODEL,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "What are the top 3 tags for this image? Provide them as a comma-separated list." },
                            { type: "image_url", image_url: { url: base64Data } }
                        ]
                    }
                ],
                max_tokens: 50
            }, { timeout: 15000, headers }); // 15 seconds timeout
            
            if (response.data?.choices?.[0]?.message?.content) {
                return response.data.choices[0].message.content.trim();
            }
        } catch (e) {
            console.warn(`Hyperspace AI Image Classification unavailable, falling back. (${e.message})`);
        }

        // Fallback to local transformers
        try {
            const classifier = await getImageClassifier();
            const results = await classifier(base64Data, { topk: 3 });
            
            // results is array of { label: string, score: number }
            const tags = results.map(r => r.label.split(',')[0]).join(', ');
            return tags;
        } catch (e) {
            console.error("Fallback AI Image Classification failed:", e.message);
            return "";
        }
    });
}

/**
 * Generate summary from text
 * Uses Hyperspace AI node first, falls back to local transformers if unavailable.
 * @param {string} text - The input text snippet
 */
async function generateDocumentSummary(text) {
    if (!text || text.trim().length < 50) return "Not enough text to summarize.";
    
    return aiQueue.enqueue(async () => {
        try {
            const headers = {};
            if (HYPERSPACE_API_KEY) {
                headers['Authorization'] = `Bearer ${HYPERSPACE_API_KEY}`;
            }

            // Attempt Hyperspace AI first
            const response = await axios.post(`${HYPERSPACE_BASE_URL}/chat/completions`, {
                model: HYPERSPACE_TEXT_MODEL,
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant that summarizes text concisely in one short sentence."
                    },
                    {
                        role: "user",
                        content: `Summarize the following text:\n\n${text}`
                    }
                ],
                max_tokens: 50
            }, { timeout: 15000, headers }); // 15 seconds timeout
            
            if (response.data?.choices?.[0]?.message?.content) {
                return response.data.choices[0].message.content.trim();
            }
        } catch (e) {
            console.warn(`Hyperspace AI Text Summarization unavailable, falling back. (${e.message})`);
        }

        // Fallback to local transformers
        try {
            const summarizer = await getTextSummarizer();
            const results = await summarizer(text, {
                max_new_tokens: 50,
                min_length: 10
            });
            
            if (results && results.length > 0 && results[0].summary_text) {
                return results[0].summary_text;
            }
            return "No summary generated.";
        } catch (e) {
            console.error("Fallback AI Text Summarization failed:", e.message);
            return "";
        }
    });
}

module.exports = {
    generateImageTags,
    generateDocumentSummary
};
