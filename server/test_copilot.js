import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function test() {
  try {
    console.log("Testing Transformers...");
    const { pipeline } = await import('@xenova/transformers');
    const embedPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    const output = await embedPipeline("test", { pooling: 'mean', normalize: true });
    console.log("Embeddings Array generated!", Array.from(output.data).length);
    
    console.log("Testing Gemini API...");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEYS.split(',')[0]);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const res = await model.generateContent("Say 'hi'");
    console.log("Gemini Output:", res.response.text());
  } catch(e) {
    console.error("Test Failed!", e);
  }
}

test();
