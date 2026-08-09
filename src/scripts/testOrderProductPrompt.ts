import { getAIResponse } from '../services/aiService';
import dotenv from 'dotenv';

dotenv.config();

async function testOrderPrompts() {
  console.log('--- Test 1: "আমি ১ কেজি মেডজুল খেজুর অর্ডার করতে চাই" ---');
  const res1 = await getAIResponse('আমি ১ কেজি মেডজুল খেজুর অর্ডার করতে চাই', 4);
  console.log('Response 1:\n', res1);

  console.log('\n--- Test 2: "গাওয়া ঘি অর্ডার করব কীভাবে?" ---');
  const res2 = await getAIResponse('গাওয়া ঘি অর্ডার করব কীভাবে?', 4);
  console.log('Response 2:\n', res2);

  process.exit(0);
}

testOrderPrompts();
