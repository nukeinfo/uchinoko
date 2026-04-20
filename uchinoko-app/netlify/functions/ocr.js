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
              text: `この血液検査の用紙から数値を読み取ってください。
日本語・英語（アメリカ・カナダ・オーストラリア）・スペイン語など
どの国の用紙でも対応します。
黒字・赤字・H・L・フラグマークがあっても数値のみ読み取ってください。
必ずJSON形式のみで返してください。余分なテキストは不要です。

{"RBC":"","HCT":"","HGB":"","MCV":"","MCH":"","MCHC":"","RDW":"","PRET":"","RET":"","RETICHGB":"","WBC":"","NEU":"","LYM":"","MON":"","EOS":"","BAS":"","NEUN":"","LYMN":"","MONN":"","EOSN":"","BASN":"","PLT":"","MPV":"","PCT":""}

各キーと対応する項目名（日本語・英語・スペイン語）:

RBC = 赤血球数 / RBC / Glóbulos Rojos
HCT = ヘマトクリット / Hematocrit / HCT / Hematocrito
HGB = ヘモグロビン濃度 / Hemoglobin / HGB / Hemoglobina
MCV = 平均赤血球容積 / MCV / Volumen Corpuscular Medio
MCH = 平均赤血球ヘモグロビン量 / MCH / HCM
MCHC = 平均赤血球ヘモグロビン濃度 / MCHC / CHCM
RDW = 赤血球分布幅 / RDW / Amplitud de Distribución Eritrocitaria
PRET = %網状赤血球 / % Reticulocyte / % RETICULOCYTE / % Reticulocitos
RET = 網状赤血球数 / Reticulocytes / RETICULOCYTE / Recuento de Reticulocitos
RETICHGB = 網状赤血球ヘモグロビン / Reticulocyte Hemoglobin / RETIC-HGB / Hemoglobina de Reticulocitos
WBC = 白血球数 / WBC / Glóbulos Blancos
NEU = 好中球% / % Neutrophils / % NEUTROPHIL / Neutrófilos %
LYM = リンパ球% / % Lymphocytes / % LYMPHOCYTE / Linfocitos %
MON = 単球% / % Monocytes / % MONOCYTE / Monocitos %
EOS = 好酸球% / % Eosinophils / % EOSINOPHIL / Eosinófilos %
BAS = 好塩基球% / % Basophils / % BASOPHIL / Basófilos %
NEUN = 好中球数 / Neutrophils / NEUTROPHIL (absolute) / Recuento de Neutrófilos
LYMN = リンパ球数 / Lymphocytes / LYMPHOCYTE (absolute) / Recuento de Linfocitos
MONN = 単球数 / Monocytes / MONOCYTE (absolute) / Recuento de Monocitos
EOSN = 好酸球数 / Eosinophils / EOSINOPHIL (absolute) / Recuento de Eosinófilos
BASN = 好塩基球数 / Basophils / BASOPHIL (absolute) / Recuento de Basófilos
PLT = 血小板 / Platelets / AUTO PLATELET / Plaquetas
MPV = 平均血小板容積 / MPV / Volumen Plaquetario Medio
PCT = 血小板クリット / PCT / Plaquetocrito

単位の変換ルール（重要）:
- HCT: L/L表記（例 0.38）の場合は%に変換して入力（例 38.0）
- HGB: g/L表記（例 134）の場合はg/dLに変換（例 13.4）
- RBC: x10E12/L または M/uL 表記はそのまま入力
- WBC: K/uL表記（例 7.9）はそのまま入力
- NEUN等絶対数: /uL表記（例 5909）の場合は÷1000して入力（例 5.909）
- PLT: K/uL または x10E9/L 表記はそのまま入力

数値が見つからない項目は空文字のままにしてください。
JSONのみ返してください。`
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
