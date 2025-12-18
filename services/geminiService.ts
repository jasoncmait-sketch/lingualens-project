import { GoogleGenerativeAI } from '@google/generative-ai';
import { Annotation } from "../types";

// Initialize Gemini Client
// Note: We create a new client in the functions to ensure we always use the latest API KEY from env
const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Translates text in an image from English to Chinese and returns bounding boxes.
 */
export const translateImageText = async (base64Image: string, mimeType: string = "image/jpeg"): Promise<Annotation[]> => {
  const ai = getAiClient();
  
  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        original: { type: Type.STRING, description: "The original English text detected." },
        translation: { type: Type.STRING, description: "The Chinese translation of the text." },
        box_2d: {
          type: Type.ARRAY,
          items: { type: Type.INTEGER },
          description: "Bounding box of the text in [ymin, xmin, ymax, xmax] format using a 0-1000 scale."
        }
      },
      required: ["original", "translation", "box_2d"]
    }
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", // Best for OCR and structured data
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image
            }
          },
          {
            text: "Identify all distinct text segments in this image. Translate English segments into Simplified Chinese. If a segment is purely numbers (e.g. '2024', '10.5') or symbols, keep the translation identical to the original. Return the result as a JSON list with bounding boxes (0-1000 scale)."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        systemInstruction: "You are an expert OCR and translation assistant. Your goal is to accurately detect text and provide translations. Do not translate numbers, currency symbols, or mathematical notation; keep them exactly as they appear in the original."
      }
    });

    const text = response.text;
    if (!text) return [];
    
    return JSON.parse(text) as Annotation[];
  } catch (error) {
    console.error("Translation error:", error);
    throw new Error("Failed to translate image text.");
  }
};

/**
 * Edits an image based on a user prompt.
 */
export const editImageWithPrompt = async (base64Image: string, prompt: string, mimeType: string = "image/jpeg"): Promise<string> => {
  const ai = getAiClient();

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image", // Specialized for image generation/editing
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image
            }
          },
          {
            text: prompt
          }
        ]
      }
    });

    // Check for image in response parts
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return part.inlineData.data;
        }
      }
    }
    
    throw new Error("No image data returned from the model.");
  } catch (error) {
    console.error("Image editing error:", error);
    throw new Error("Failed to edit image.");
  }
};
