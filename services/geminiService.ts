/**
 * 1. 你的 CloudCone 服务器中转地址
 * 如果 1Panel 配置了 SSL，用 https；如果是 IP 直连，用 http
 */
const PROXY_URL = "http://api.jasonx.site"; 

/**
 * 2. 请求函数 - 路径建议用 v1beta，功能最全
 */
const callGeminiApi = async (modelName: string, payload: any) => {
  // 最终路径：http://IP/v1beta/models/gemini-2.0-flash:generateContent
  const endpoint = `${PROXY_URL}/v1beta/models/${modelName}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // 注意：不要在这里传 API Key，如果你已经在服务器 Nginx 里处理了
      // 或者保持现状，让 Worker/前端 传过去，Nginx 只负责透传
    },
    body: JSON.stringify(payload)
  });
  // ... 后续逻辑保持不变
