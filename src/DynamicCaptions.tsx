import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSans";

const { fontFamily } = loadFont("normal", {
  weights: ["300", "400", "600", "700", "800", "900"],
});

const CWI_AE_ANTICIPATION_FRAMES = 3;
const CWI_AE_WORD_LIFT_EM = 0.20;
const CWI_AE_ANTICIPATION_DIP_EM = 0.05;
const DECAY_DURATION = 0.25;

const FALLBACK_COLORS: Record<string, string> = {
  S0: "#27AE60",
  S1: "#F5A623",
  S2: "#BD10E0",
  S3: "#00C2FF",
};

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

export interface CaptionBlock {
  id: string;
  start: number;
  end: number;
  speaker_id?: string;
  speakerId?: string;
  type?: "dialogue" | "music" | "sfx" | "sound" | string;
  words: Word[];
}

export interface CastMember {
  id: string;
  name: string;
  color: string;
}

export interface DynamicCaptionsProps {
  captions?: CaptionBlock[] | any[];
  cast?: CastMember[] | any[];
}

function processBracketGroups(words: Word[]): Word[] {
  if (!words || words.length === 0) return [];

  const result: Word[] = [];
  let currentGroup: Word[] = [];
  let inGroup = false;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const text = word?.text || "";
    const hasOpen = text.includes("[");
    const hasClose = text.includes("]");

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

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

function isShoutWord(word: Word): boolean {
  if (word.type === "shout") return true;
  if (typeof word.volumePercent === "number" && word.volumePercent >= 80) return true;
  if (typeof word.weight === "number" && word.weight >= 800) return true;
  return false;
}

function isWhisperWord(word: Word): boolean {
  if (word.type === "whisper") return true;
  if (typeof word.volumePercent === "number" && word.volumePercent > 0 && word.volumePercent <= 30) return true;
  return false;
}

function volumeScaleForWord(word: Word): number {
  if (!word) return 1.15;
  if (isShoutWord(word)) return 1.15;
  if (isWhisperWord(word)) return 1.03;

  if (typeof word.volumePercent === "number") {
    return Math.min(1.15, 1 + ((clamp(word.volumePercent, 0, 100) - 50) / 100) * 0.15);
  }
  if (typeof word.emphasis === "number") {
    return Math.min(1.15, 1 + clamp(word.emphasis, 0, 1) * 0.15);
  }
  if (typeof word.emphasis === "boolean") {
    return word.emphasis ? 1.15 : 1.0;
  }
  return 1.15;
}

function activeWordScaleEnvelope(progress: number, durationSec: number = 0.3): number {
  const stiffness = 180;
  const damping = 12;
  const mass = 0.8;

  const omega = Math.sqrt(stiffness / mass);
  const alpha = damping / (2 * mass);

  const t = progress * Math.max(0.15, durationSec);
  const springFactor = Math.exp(-alpha * t) * Math.cos(omega * t);

  const baseSine = Math.sin(Math.PI * progress);
  return clamp(baseSine * (1 + 0.25 * (1 - springFactor)), 0, 1.35);
}

function aeWordMotionState(
  cue: any,
  word: Word,
  time: number,
  fps: number,
  fontSize: number,
  frame: number
) {
  const idle = { transform: "", spoken: false, active: false, anticipating: false };
  if (
    !cue ||
    (cue.type !== "dialogue" && cue.type !== "music" && cue.type !== "sfx" && cue.type !== "sound") ||
    !word
  )
    return idle;

  const start = Number(word.start);
  const end = Number(word.end);
  if (!Number.isFinite(start)) return idle;

  const anticipationSeconds = CWI_AE_ANTICIPATION_FRAMES / Math.max(1, fps);
  const spoken = time >= start;
  const active = Number.isFinite(end) && end > start && time >= start && time <= end;
  const anticipating = !spoken && time >= start - anticipationSeconds;
  let yEm = 0;
  let scale = 1;

  if (active) {
    const duration = end - start;
    const progress = clamp((time - start) / duration, 0, 1);
    const framesSinceStart = Math.max(0, (time - start) * fps);

    const springBounce = spring({
      frame: framesSinceStart,
      fps,
      config: {
        damping: 12,
        stiffness: 180,
        mass: 0.7,
      },
    });

    const springScale = activeWordScaleEnvelope(progress, duration);

    yEm = -CWI_AE_WORD_LIFT_EM * Math.sin(Math.PI * progress) * (0.85 + 0.15 * springBounce);
    scale = 1 + (volumeScaleForWord(word) - 1) * springScale;
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

  // Verifica se a frase/bloco inteiro é composta por sussurros
  const isWholeBlockWhisper = processedWords.length > 0 && processedWords.every(isWhisperWord);

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
      <div
        style={{
          backgroundColor: "rgba(0, 0, 0, 1)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(5px)",
          padding: "0px 5px",
          minHeight: "35px",
          boxSizing: "border-box",
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

        let wordColor = "#FFFFFF";
        if (motion.spoken && !isBracketText) {
          wordColor = speakerColor;
        }

        // 1. Define o peso alvo da palavra
        let targetWeight = DEFAULT_FONT_WEIGHT;
        if (shout) {
          targetWeight = 900;
        } else if (whisper) {
          targetWeight = 300;
        } else if (typeof w.weight === "number") {
          targetWeight = w.weight;
        }

        // 2. Se o peso for diferente do padrão (e não for um bloco de sussurro contínuo), ele DEVE decair gradualmente de volta ao padrão
        const shouldDecayWeight = targetWeight !== DEFAULT_FONT_WEIGHT && !(whisper && isWholeBlockWhisper);

        let fontWeight = DEFAULT_FONT_WEIGHT;

        if (currentTime >= w.start && currentTime <= w.end) {
          // Transição gradual para engrossar durante a fala
          const weightProgress = clamp((currentTime - w.start) / 0.15, 0, 1);
          fontWeight = Math.round(
            DEFAULT_FONT_WEIGHT + (targetWeight - DEFAULT_FONT_WEIGHT) * weightProgress
          );
        } else if (currentTime > w.end) {
          if (shouldDecayWeight) {
            // Transição suave (decaimento) de volta ao peso padrão após o fim da palavra
            const decayProgress = clamp((currentTime - w.end) / DECAY_DURATION, 0, 1);
            const smoothDecay = 1 - (decayProgress * decayProgress * (3 - 2 * decayProgress));
            fontWeight = Math.round(
              DEFAULT_FONT_WEIGHT + (targetWeight - DEFAULT_FONT_WEIGHT) * smoothDecay
            );
          } else {
            fontWeight = targetWeight;
          }
        }

        const reservedWeight = Math.max(DEFAULT_FONT_WEIGHT, targetWeight);
        const letterSpacing = whisper ? "0.03em" : "-0.015em";

        return (
          <span
            key={`${activeBlock.id || "b"}-${idx}`}
            style={{
              display: "inline-grid",
              alignItems: "center",
              justifyItems: "center",
              position: "relative",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                gridArea: "1 / 1",
                fontFamily: `${fontFamily}, sans-serif`,
                fontWeight: reservedWeight,
                fontSize: `${fontSize}px`,
                lineHeight: 1.2,
                letterSpacing,
                visibility: "hidden",
                pointerEvents: "none",
                whiteSpace: "pre",
              }}
            >
              {w.text}
            </span>

            <span
              style={{
                gridArea: "1 / 1",
                fontFamily: `${fontFamily}, sans-serif`,
                fontWeight,
                fontStyle: "normal",
                fontSize: `${fontSize}px`,
                lineHeight: 1.2,
                color: wordColor,
                display: "inline-block",
                position: "relative",
                zIndex: motion.active ? 10 : motion.anticipating ? 5 : 1,
                transform: motion.transform,
                transformOrigin: "center center",
                letterSpacing,
                textShadow: "none",
                textTransform: "none",
                willChange: "transform, color",
                whiteSpace: "pre",
              }}
            >
              {w.text}
            </span>
          </span>
        );
      })}
      </div>
    </div>
  );
};