import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { Annotation } from "../types";

// 1. Initialize Gemini Client correctly
// Using NEXT_PUBLIC ensures it's accessible if called from the client side
const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Translates text in an image from English to Chinese and returns bounding boxes.
 */
export const translateImageText = async (base64Image: string, mimeType: string = "image/jpeg"): Promise<Annotation[]> => {
  // 2. Use the correct model name (gemini-1.5-flash is standard for OCR)
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    }
  });

  try {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Image
        }
      },
      {
        text: "Identify all distinct text segments in this image. Translate English segments into Simplified Chinese. Return the result as a JSON list with bounding boxes (0-1000 scale) in the format: { \"original\": \"text\", \"translation\": \"text\", \"box_2d\": [ymin, xmin, ymax, xmax] }."
      }
    ]);

    const response = await result.response;
    const text = response.text();
    
    // 3. Robust JSON parsing
    const cleanJson = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanJson) as Annotation[];
    
  } catch (error) {
    console.error("Translation error:", error);
    throw new Error("Failed to translate image text.");
  }
};

/**
 * Edits an image based on a user prompt.
 */
export const editImageWithPrompt = async (base64Image: string, prompt: string, mimeType: string = "image/jpeg"): Promise<string> => {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Image
        }
      },
      { text: prompt }
    ]);

    const response = await result.response;
    
    // Note: Gemini 1.5 Flash mainly returns text. 
    // If you are using a model that generates images, 
    // the check below looks for the binary data part.
    const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
    if (part?.inlineData?.data) {
      return part.inlineData.data;
    }
    
    // If the model returned text instead of a direct image edit
    return response.text();
  } catch (error) {
    console.error("Image editing error:", error);
    throw new Error("Failed to edit image.");
  }
};
