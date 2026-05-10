/**
 * testHuggingFace.js
 * Verifies the Hugging Face service integration.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyFashionImage, getImageEmbedding, getTextEmbedding } from '../services/huggingface.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const testHF = async () => {
  const testImageUrl = 'https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/pipeline-cat-chonk.jpeg';

  console.log('🚀 Testing Hugging Face Integration...');
  
  if (!process.env.HUGGING_FACE_API_KEY || process.env.HUGGING_FACE_API_KEY === 'your_hugging_face_api_key_here') {
    console.error('❌ Error: Please set a valid HUGGING_FACE_API_KEY in backend/.env');
    process.exit(1);
  }

  // 1. Test Classification
  console.log('\n🔍 Testing Image Classification...');
  const tags = await classifyFashionImage(testImageUrl);
  if (tags) {
    console.log('✅ Top 3 Detected Tags:');
    tags.slice(0, 3).forEach(t => console.log(`   - ${t.label}: ${Math.round(t.score * 100)}%`));
  } else {
    console.log('❌ Classification failed.');
  }

  // 2. Test CLIP Embedding
  console.log('\n🧬 Testing CLIP Visual Embedding...');
  const embedding = await getImageEmbedding(testImageUrl);
  if (embedding) {
    console.log(`✅ Generated embedding vector with length: ${embedding.length}`);
    console.log(`   Preview (first 5): [${embedding.slice(0, 5).join(', ')}...]`);
  } else {
    console.log('❌ Embedding generation failed.');
  }
  
  // 3. Test Text Embedding
  console.log('\n💬 Testing Text Embedding (NLP)...');
  const textEmbedding = await getTextEmbedding('A beautiful pink floral dress');
  if (textEmbedding) {
    console.log(`✅ Generated text embedding vector with length: ${textEmbedding.length}`);
  } else {
    console.log('❌ Text embedding failed.');
  }

  console.log('\n✨ Integration test finished.');
};

testHF();
