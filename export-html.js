const fs = require("fs");
const path = require("path");

// Carrega os dados das legendas
const captionsData = require("./src/captions.json");

const FALLBACK_COLORS = {
  S0: "#27AE60",
  S1: "#F5A623",
  S2: "#BD10E0",
  S3: "#00C2FF",
};

// Transforma cada bloco do JSON em elementos HTML estilizados
const htmlBlocks = (captionsData.captions || []).map((block, bIdx) => {
  const speakerId = block.speaker_id || "S0";
  const speakerFromCast = (captionsData.cast || []).find((s) => s && s.id === speakerId);
  const speakerColor = speakerFromCast?.color || FALLBACK_COLORS[speakerId] || "#27AE60";

  const wordsHtml = (block.words || []).map((w, wIdx) => {
    let e = 0.25;
    if (typeof w.emphasis === "number") {
      e = Math.max(0, Math.min(1.5, w.emphasis));
    } else if (typeof w.emphasis === "boolean") {
      e = w.emphasis ? 0.9 : 0.25;
    }

    const scaleY = 0.9 + e * 0.95;
    const scaleX = 0.92 + e * 0.4;
    const fontSize = 44 * (w.size ?? 1.0);

    return `
      <span 
        class="caption-word" 
        data-start="${w.start}" 
        data-end="${w.end}"
        style="
          font-family: system-ui, -apple-system, sans-serif;
          font-weight: 600;
          font-size: ${fontSize}px;
          line-height: 1.2;
          color: ${speakerColor};
          display: inline-block;
          transform: scale(${scaleX}, ${scaleY});
          transform-origin: center bottom;
          letter-spacing: -0.015em;
          margin: 0 4px;
        "
      >
        ${w.text}
      </span>`.trim();
  }).join("\n        ");

  return `
    <!-- Bloco ${bIdx + 1} | Tempo: ${block.start}s - ${block.end}s | Speaker: ${speakerId} -->
    <div 
      class="caption-block" 
      id="block-${block.id || bIdx}"
      data-start="${block.start}" 
      data-end="${block.end}"
      style="
        background-color: rgba(0, 0, 0, 0.90);
        padding: 18px 36px;
        border-radius: 8px;
        display: flex;
        justify-content: center;
        align-items: baseline;
        flex-wrap: wrap;
        column-gap: 16px;
        row-gap: 12px;
        max-width: 92%;
        box-shadow: 0 10px 32px rgba(0, 0, 0, 0.8);
        margin-bottom: 24px;
      "
    >
        ${wordsHtml}
    </div>`;
}).join("\n");

// Estrutura do documento HTML completo
const fullHtmlDocument = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Legendas Exportadas em HTML</title>
  <style>
    body {
      background-color: #111;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 20px;
      margin: 0;
    }
  </style>
</head>
<body>

  ${htmlBlocks}

</body>
</html>`;

// Salva o arquivo no disco
fs.writeFileSync(path.join(__dirname, "legendas_cwi.html"), fullHtmlDocument, "utf-8");
console.log("HTML com todas as legendas exportado com sucesso em 'legendas_cwi.html'!");