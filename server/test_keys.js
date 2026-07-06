import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const keys = process.env.GEMINI_API_KEYS.split(',').filter(Boolean);

async function testKeys() {
  for (let i = 0; i < keys.length; i++) {
    console.log(`Testing key ${i + 1}...`);
    try {
      const genAI = new GoogleGenerativeAI(keys[i]);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });
      const res = await model.generateContent("Say hi");
      console.log(`Key ${i+1} Success! Output:`, res.response.text());
    } catch(err) {
      console.error(`Key ${i+1} Failed:`, err.status, err.message);
    }
  }
}

testKeys();
