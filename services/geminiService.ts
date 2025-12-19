import { Annotation } from "../types";

/**
 * 1. 你的代理服务器地址
 */
const PROXY_URL = "https://gemini-proxy.jasoncmait.workers.dev";

/**
 * 2. 辅助函数：统一处理 Fetch 请求
 */
const callGeminiApi = async (model: string, payload: any) => {
  // 直接通过 fetch 访问你的 Worker 代理
  const response = await fetch(`${PROXY_URL}/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("API Response Error:", errorData);
    throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
  }

  return await response.json();
};

/**
 * 翻译图像中的文本
 */
export const translateImageText = async (base64Image: string, mimeType: string = "image/jpeg"): Promise<Annotation[]> => {
  const payload = {
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
    generationConfig: {
      responseMimeType: "application/json",
      // 这里手动定义 Response Schema，fetch 模式下直接写对象即可
      responseSchema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            original: { type: "string" },
            translation: { type: "string" },
            box_2d: { type: "array", items: { type: "integer" } }
          },
          required: ["original", "translation", "box_2d"]
        }
      }
    },
    systemInstruction: {
      parts: [{
        text: "You are an expert OCR and translation assistant. Your goal is to accurately detect text and provide translations. Do not translate numbers, currency symbols, or mathematical notation; keep them exactly as they appear in the original."
      }]
    }
  };

  try {
    const data = await callGeminiApi("gemini-1.5-flash", payload);
    
    // 解析 Google API 返回的标准结构
    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResult) return [];
    
    return JSON.parse(textResult) as Annotation[];
  } catch (error) {
    console.error("Translation error:", error);
    throw new Error("Failed to translate image text.");
  }
};

/**
 * 根据用户指令编辑图像 (或进行复杂对话)
 */
export const editImageWithPrompt = async (base64Image: string, prompt: string, mimeType: string = "image/jpeg"): Promise<string> => {
  const payload = {
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
  };

  try {
    const data = await callGeminiApi("gemini-1.5-flash", payload);
    
    // 检查是否有返回的数据部分 (针对图片生成模型或返回图片内容的情况)
    const parts = data.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        return part.inlineData.data;
      }
    }
    
    // 如果没有图片数据，返回第一个文本部分的内容
    return parts[0]?.text || "No response content";
  } catch (error) {
    console.error("Image editing error:", error);
    throw new Error("Failed to edit image.");
  }
};
