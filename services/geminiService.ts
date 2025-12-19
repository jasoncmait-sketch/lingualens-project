import { Annotation } from "../types";

/**
 * 1. 代理服务器配置
 */
const PROXY_URL = "https://gemini-proxy.jasoncmait.workers.dev";

/**
 * 2. 基础请求函数 (使用 v1 版本)
 */
const callGeminiApi = async (modelName: string, payload: any) => {
  // 刚才你手动访问 /v1/models 成功，所以这里必须用 v1
  const endpoint = `${PROXY_URL}/v1/models/${modelName}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload)
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Gemini API Error Response:", responseData);
    throw new Error(
      responseData.error?.message || `请求失败 (Status: ${response.status})`
    );
  }

  return responseData;
};

/**
 * 3. 图像翻译主函数 (适配 Gemini 2.0)
 */
export const translateImageText = async (
  base64Image: string, 
  mimeType: string = "image/jpeg"
): Promise<Annotation[]> => {
  
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
          text: "Identify all distinct text segments in this image. Translate English segments into Simplified Chinese. If a segment is purely numbers or symbols, keep the translation identical to the original. Return the result as a JSON list with bounding boxes (0-1000 scale)."
        }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            original: { type: "string" },
            translation: { type: "string" },
            box_2d: { 
              type: "array", 
              items: { type: "integer" } 
            }
          },
          required: ["original", "translation", "box_2d"]
        }
      }
    },
    systemInstruction: {
      parts: [{
        text: "You are an expert OCR and translation assistant. Your goal is to accurately detect text and provide translations. Keep numbers and symbols exactly as they appear."
      }]
    }
  };

  try {
    // 【关键】：使用你列表里确认存在的 gemini-2.0-flash
    const data = await callGeminiApi("gemini-2.0-flash", payload);
    
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!resultText) {
      console.warn("API 没有返回文本内容");
      return [];
    }
    
    return JSON.parse(resultText) as Annotation[];
  } catch (error) {
    console.error("Translation Error Details:", error);
    throw new Error("翻译图片失败，请检查配置。");
  }
};

/**
 * 4. 图像编辑/对话函数
 */
export const editImageWithPrompt = async (
  base64Image: string, 
  prompt: string, 
  mimeType: string = "image/jpeg"
): Promise<string> => {
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
    const data = await callGeminiApi("gemini-2.0-flash", payload);
    const parts = data.candidates?.[0]?.content?.parts || [];
    
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        return part.inlineData.data;
      }
    }
    
    return parts[0]?.text || "No response content";
  } catch (error) {
    console.error("Image editing error:", error);
    throw new Error("编辑图片失败。");
  }
};
