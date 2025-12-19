import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Annotation } from "../types";

/**
 * 获取 AI 客户端
 * 适配 Vite 环境：使用 import.meta.env 替代 process.env
 * 变量名推荐使用 VITE_API_KEY
 */
// 1. 定义你的 Worker 地址
// 1. 定义你的 Worker 地址 (确保这一行最后有引号和分号)
const PROXY_URL = "https://gemini-proxy.jasoncmait.workers.dev";

// 2. 修改 getAiClient 
const getAiClient = () => {
  // 注意：现在前端不再需要传入真正的 apiKey 了，因为 Worker 会帮我们补上
  // 我们传一个占位符，或者通过修改 SDK 的 baseUrl 来实现
  return new GoogleGenAI({ apiKey: "PROXY_ACTIVE" }); 
};

//const getAiClient = () => {
  // 优先读取 Vite 规范的变量，其次读取通用变量，最后为空字符串
  //const apiKey = import.meta.env.VITE_API_KEY || import.meta.env.API_KEY || "";
  
  //if (!apiKey) {
    //console.error("Gemini API Key 缺失！请在 Cloudflare 后台设置 VITE_API_KEY 环境变量。");
  //}
  
 // return new GoogleGenAI({ apiKey });
//};

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
      model: "gemini-2.0-flash", // 注意：如果你是免费版，请确认模型名称是否为 gemini-1.5-flash 或 2.0 版本
      contents: [{
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
      }],
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
      model: "gemini-2.0-flash", // 建议使用统一的模型名称
      contents: [{
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
      }]
    });

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
