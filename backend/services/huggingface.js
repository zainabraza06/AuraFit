import { HfInference } from '@huggingface/inference';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Initialize the SDK after loading environment variables
const hf = new HfInference(process.env.HUGGING_FACE_API_KEY);

/**
 * Classifies a fashion image to extract categories/attributes.
 */
export const classifyFashionImage = async (imageUrl) => {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    // Use Uint8Array which is widely supported in both Node and Browser for HF SDK
    const imageData = new Uint8Array(response.data);

    const result = await hf.imageClassification({
      data: imageData,
      model: 'google/vit-base-patch16-224',
    });

    return result;
  } catch (error) {
    console.error('❌ HF Image Classification failed:', error.message);
    return null;
  }
};

/**
 * Generates a multimodal embedding (vector) for an image.
 */
export const getImageEmbedding = async (imageUrl) => {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageData = new Uint8Array(response.data);

    const result = await hf.featureExtraction({
      data: imageData,
      model: 'google/vit-base-patch16-224',
    });

    return result;
  } catch (error) {
    console.error('❌ HF Image Embedding failed:', error.message);
    return null;
  }
};

/**
 * Generates a multimodal embedding (vector) for text.
 */
export const getTextEmbedding = async (text) => {
  try {
    const result = await hf.featureExtraction({
      inputs: text,
      model: 'sentence-transformers/all-MiniLM-L6-v2',
    });

    return result;
  } catch (error) {
    console.error('❌ HF Text Embedding failed:', error.message);
    return null;
  }
};
