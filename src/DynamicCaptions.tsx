import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSans";

const { fontFamily } = loadFont();

const CWI_AE_ANTICIPATION_FRAMES = 3;
const CWI_AE_WORD_LIFT_EM = 0.20;
const CWI_AE_ANTICIPATION_DIP_EM = 0.05;

const FALLBACK_COLORS: Record<string, string> = {
  S0: "#27AE60",
  S1: "#F5A623",
  S2: "#BD10E0",
  S3: "#00C2FF",
};

// estrutura de uma palavra individual dentro de um bloco de legenda
export interface Word {
  text: string;
  start: number;
  end: number;
  weight?: number;
  size?: number;
  emphasis?: number | boolean;
  pitch?: number;
  volume?: number;
  volumePercent?: number;
  type?: "whisper" | "shout" | "normal" | string;
}

// estrutura de um bloco de legenda, que contém várias palavras
export interface CaptionBlock {
  id: string;
  start: number;
  end: number;
  speaker_id?: string;
  speakerId?: string;
  type?: "dialogue" | "music" | "sfx" | "sound" | string;
  words: Word[];
}

// locutor 
export interface CastMember {
  id: string;
  name: string;
  color: string;
}

// props do componente DynamicCaptions
export interface DynamicCaptionsProps {
  captions?: CaptionBlock[] | any[];
  cast?: CastMember[] | any[];
}

// função para processar grupos de palavras entre colchetes
function processBracketGroups(words: Word[]): Word[] {

  // se não houver palavras, retorna um array vazio
  if (!words || words.length === 0) return [];

  const result: Word[] = [];
  let currentGroup: Word[] = [];
  let inGroup = false;

  // percorre cada palavra e agrupa as que estão entre colchetes
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const text = word?.text || "";
    const hasOpen = text.includes("[");
    const hasClose = text.includes("]");

    // se encontrar uma palavra com colchete de abertura e não estiver em um grupo, inicia um novo grupo
    if (hasOpen && !inGroup) {
      inGroup = true;
      currentGroup = [{ ...word }];
      
      if (hasClose) {
        result.push(currentGroup[0]);
        currentGroup = [];
        inGroup = false;
      }
    } else if (inGroup) {
      currentGroup.push({ ...word });

      if (hasClose) {
        inGroup = false;
        const mergedText = currentGroup.map((w) => w.text).join(" ");
        const firstWord = currentGroup[0];
        const lastWord = currentGroup[currentGroup.length - 1];

        result.push({
          ...firstWord,
          text: mergedText,
          start: firstWord.start,
          end: lastWord.end,
          type: firstWord.type || lastWord.type,
        });

        currentGroup = [];
      }
    } else {
      result.push({ ...word });
    }
  }

  // se ainda houver um grupo em aberto, mescla as palavras restantes
  if (currentGroup.length > 0) {
    const mergedText = currentGroup.map((w) => w.text).join(" ");
    const firstWord = currentGroup[0];
    const lastWord = currentGroup[currentGroup.length - 1];

    result.push({
      ...firstWord,
      text: mergedText,
      start: firstWord.start,
      end: lastWord.end,
    });
  }

  return result;
}

// função para limitar um valor entre um mínimo e um máximo
function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

// função para determinar se uma palavra é um grito
function isShoutWord(word: Word): boolean {
  if (word.type === "shout") return true;
  if (typeof word.volumePercent === "number" && word.volumePercent >= 80) return true;
  if (typeof word.weight === "number" && word.weight >= 800) return true;
  return false;
}

// função para determinar se uma palavra é um sussurro
function isWhisperWord(word: Word): boolean {
  if (word.type === "whisper") return true;
  if (typeof word.volumePercent === "number" && word.volumePercent > 0 && word.volumePercent <= 30) return true;
  return false;
}

// função para calcular a escala de volume de uma palavra com base em suas propriedades
function volumeScaleForWord(word: Word): number {
  if (!word) return 1.15;
  if (isShoutWord(word)) return 1.25;
  if (isWhisperWord(word)) return 1.03;

  if (typeof word.volumePercent === "number") {
    return 1 + ((clamp(word.volumePercent, 0, 100) - 50) / 100) * 0.35;
  }
  if (typeof word.emphasis === "number") {
    return 1 + clamp(word.emphasis, 0, 1) * 0.25;
  }
  if (typeof word.emphasis === "boolean") {
    return word.emphasis ? 1.25 : 1.0;
  }
  return 1.15;
}

// função para calcular o estado de movimento de uma palavra com base no tempo atual e nas propriedades da palavra
function aeWordMotionState(
  cue: any,
  word: Word,
  time: number,
  fps: number,
  fontSize: number,
  frame: number
) {
  // estado padrão para palavras inativas
  const idle = { transform: "", spoken: false, active: false, anticipating: false };
  if (
    !cue ||
    (cue.type !== "dialogue" && cue.type !== "music" && cue.type !== "sfx" && cue.type !== "sound") ||
    !word
  )
    return idle;

  // obtém os tempos de início e fim da palavra
  const start = Number(word.start);
  const end = Number(word.end);
  if (!Number.isFinite(start)) return idle;

  // calcula o tempo de antecipação em segundos com base na taxa de quadros
  const anticipationSeconds = CWI_AE_ANTICIPATION_FRAMES / Math.max(1, fps);
  const spoken = time >= start;
  const active = Number.isFinite(end) && end > start && time >= start && time <= end;
  const anticipating = !spoken && time >= start - anticipationSeconds;
  let yEm = 0;
  let scale = 1;

  // se a palavra estiver ativa, calcula o progresso da animação e aplica efeitos de elevação e escala
  if (active) {
    const progress = clamp((time - start) / (end - start), 0, 1);
    yEm = -CWI_AE_WORD_LIFT_EM * Math.sin(Math.PI * progress);

    const whisper = isWhisperWord(word);
    const whisperScale = whisper ? 0.75 : 1.0;
    const wordBaseSize = word.size ?? 1.0;
    const volScale = volumeScaleForWord(word);

    const maxScale = wordBaseSize * whisperScale * volScale;
    scale = 1 + (maxScale - 1) * Math.sin(Math.PI * progress);
  } else if (anticipating) {
    const progress = clamp((time - (start - anticipationSeconds)) / anticipationSeconds, 0, 1);
    yEm = CWI_AE_ANTICIPATION_DIP_EM * Math.sin(Math.PI * progress);
  }

  let translateX = 0;
  let translateY = yEm * fontSize;

  const shout = isShoutWord(word);
  if (shout && active) {
    translateX += Math.sin(frame * 2.5) * 1.8;
    translateY += Math.cos(frame * 2.8) * 1.8;
  }

  const transforms: string[] = [];
  if (translateX !== 0 || translateY !== 0) {
    transforms.push(`translate(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px)`);
  }
  if (scale !== 1) {
    transforms.push(`scale(${scale.toFixed(3)})`);
  }

  return {
    transform: transforms.join(" "),
    spoken,
    active,
    anticipating,
  };
}

// componente principal para renderizar legendas dinâmicas
export const DynamicCaptions: React.FC<DynamicCaptionsProps> = ({ captions = [], cast = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / Math.max(1, fps);

  if (!Array.isArray(captions) || captions.length === 0) {
    return null;
  }

  const activeBlock = captions.find((c: any) => {
    if (!c || typeof c.start !== "number" || typeof c.end !== "number") return false;
    return currentTime >= c.start && currentTime <= c.end + 0.15;
  });

  if (!activeBlock || !Array.isArray(activeBlock.words) || activeBlock.words.length === 0) {
    return null;
  }

  const processedWords = processBracketGroups(activeBlock.words);

  const blockType = activeBlock.type || "dialogue";
  const isMusic = blockType === "music";
  const isSFX = blockType === "sfx" || blockType === "sound";

  const speakerId = activeBlock.speaker_id || activeBlock.speakerId || "S0";
  const speakerFromCast = Array.isArray(cast) ? cast.find((s: any) => s && s.id === speakerId) : null;
  const speakerColor = speakerFromCast?.color || FALLBACK_COLORS[speakerId] || "#27AE60";

  const normalizedCue = {
    ...activeBlock,
    type: blockType,
  };

  const BASE_FONT_SIZE = 44;
  const DEFAULT_FONT_WEIGHT = 600;

  return (
    // contêiner principal para as legendas, posicionado na parte inferior da tela
    <div
      style={{
        position: "absolute",
        bottom: "6%",
        left: 0,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 50,
        pointerEvents: "none",
        boxSizing: "border-box",
        padding: "0 40px",
      }}
    >
      // contêiner interno para as palavras, com estilo de fundo e layout flexível
      <div
        style={{
          backgroundColor: "rgba(10, 10, 10, 1)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(5px)",
          padding: "0px 5px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexWrap: "wrap",
          columnGap: "12px",
          rowGap: "8px",
          maxWidth: "88%",
          overflow: "visible",
          border: isSFX
            ? "1px dashed rgba(255, 255, 255, 0.4)"
            : "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        {isMusic && (
          <span style={{ fontSize: "42px", marginRight: "6px", color: speakerColor }}>
            ♪
          </span>
        )}

        {processedWords.map((w: Word, idx: number) => {
          if (!w || !w.text) return null;

          const shout = isShoutWord(w);
          const whisper = isWhisperWord(w);

          const fontSize = BASE_FONT_SIZE;
          const motion = aeWordMotionState(normalizedCue, w, currentTime, fps, fontSize, frame);

          const isBracketText = w.text.includes("[") || w.text.includes("]");

          let wordColor = motion.spoken ? speakerColor : "#FFFFFF";
          if (isBracketText) {
            wordColor = "#FFFFFF";
          }

          let fontWeight = DEFAULT_FONT_WEIGHT;
          if (shout) {
            fontWeight = 900;
          } else if (whisper) {
            fontWeight = 400;
          } else if (typeof w.weight === "number") {
            fontWeight = w.weight;
          }

          // renderiza cada palavra como um elemento <span> com estilos dinâmicos baseados no estado de movimento e nas propriedades da palavra
          return (
            <span
              key={`${activeBlock.id || "b"}-${idx}`}
              style={{
                fontFamily: `${fontFamily}, sans-serif`,
                fontWeight,
                fontStyle: whisper ? "italic" : "normal",
                fontSize: `${fontSize}px`,
                lineHeight: 1.2,
                color: wordColor,
                display: "inline-block",
                position: "relative",
                zIndex: motion.active ? 10 : motion.anticipating ? 5 : 1,
                transform: motion.transform,
                transformOrigin: "center center",
                letterSpacing: whisper ? "0.03em" : "-0.015em",
                textShadow: "none",
                textTransform: "none",
                willChange: "transform, color",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};