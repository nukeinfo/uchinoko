const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

exports.handler = async (event, context) => {
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
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "APIキーが設定されていません" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "リクエストボディのパースに失敗しました" }),
    };
  }

  const { imageBase64, mediaType } = body;

  if (!imageBase64 || !mediaType) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "imageBase64とmediaTypeは必須です" }),
    };
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(mediaType)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "対応していない画像形式です" }),
    };
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
        model: "claude-opus-4-5",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: `この血液検査結果の画像を読み取り、以下のJSON形式で返してください。
検査項目が見つからない場合はnullにしてください。

{
  "examDate": "検査日 (YYYY-MM-DD形式、不明ならnull)",
  "institution": "検査機関名 (不明ならnull)",
  "items": [
    {
      "name": "検査項目名",
      "value": "数値 (文字列)",
      "unit": "単位",
      "refLow": "基準値下限",
      "refHigh": "基準値上限",
      "flag": "H(高)/L(低)/null"
    }
  ],
  "notes": "所見や備考 (なければnull)"
}

JSONのみ返してください。`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: "Claude APIエラー", detail: errText }),
      };
    }

    const data = await response.json();
    const text = data.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");

    let parsed;
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = { raw: text };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ result: parsed }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "内部エラー", detail: err.message }),
    };
  }
};
