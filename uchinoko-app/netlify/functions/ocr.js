exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "APIキーが設定されていません" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "リクエストのパースに失敗しました" }) };
  }

  const { imageBase64, mediaType = "image/jpeg" } = body;
  if (!imageBase64) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "imageBase64は必須です" }) };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 }
            },
            {
              type: "text",
              text: `この血液検査の用紙から以下の項目の数値を読み取ってください。
必ずJSON形式のみで返してください。余分なテキストは不要です。
{"RBC":"","HCT":"","HGB":"","RET":"","NRBC":"","WBC":"","NEU":"","LYM":"","MON":"","EOS":"","BAS":"","PLT":"","MPV":"","PCT":""}
数値が見つからない項目は空文字のままにしてください。`
            }
          ]
        }]
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Claude APIエラー", detail: errText }) };
    }

    const data = await response.json();
    const text = data.content.filter(c => c.type === "text").map(c => c.text).join("");

    let parsed;
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      return { statusCode: 200, headers, body: JSON.stringify({ error: "JSON変換失敗", raw: text }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, values: parsed }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "内部エラー", detail: err.message }) };
  }
};
