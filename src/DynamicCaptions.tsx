import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/NotoSans";

const { fontFamily } = loadFont();

// Configurações de Física da Animação (After Effects Motion)
const CWI_AE_ANTICIPATION_FRAMES = 3;
const CWI_AE_WORD_LIFT_EM = 0.20;
const CWI_AE_ANTICIPATION_DIP_EM = 0.05;

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

interface Props {
  captions?: CaptionBlock[] | any[];
  cast?: CastMember[] | any[];
}

// Auxiliares de cálculo físico
function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

function volumeScaleForWord(word: Word): number {
  if (!word) return 1;
  if (typeof word.volumePercent === "number") {
    return 1 + ((word.volumePercent - 50) / 100) * 0.35;
  }
  if (typeof word.emphasis === "number") {
    return 1 + word.emphasis * 0.25;
  }
  if (typeof word.emphasis === "boolean") {
    return word.emphasis ? 1.225 : 1.0;
  }
  return 1.15;
}

function activeWordScaleEnvelope(progress: number): number {
  return Math.sin(Math.PI * progress);
}

function aeWordMotionState(
  cue: any,
  word: Word,
  time: number,
  fps: number,
  fontSize: number
) {
  const idle = { transform: "", spoken: false, active: false, anticipating: false };
  if (!cue || (cue.type !== "dialogue" && cue.type !== "music") || !word) return idle;

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
    const progress = clamp((time - start) / (end - start), 0, 1);
    yEm = -CWI_AE_WORD_LIFT_EM * Math.sin(Math.PI * progress);
    scale = 1 + (volumeScaleForWord(word) - 1) * activeWordScaleEnvelope(progress);
  } else if (anticipating) {
    const progress = clamp((time - (start - anticipationSeconds)) / anticipationSeconds, 0, 1);
    yEm = CWI_AE_ANTICIPATION_DIP_EM * Math.sin(Math.PI * progress);
  }

  const transforms: string[] = [];
  if (yEm) transforms.push(`translateY(${(yEm * fontSize).toFixed(2)}px)`);
  if (scale !== 1) transforms.push(`scale(${scale.toFixed(3)})`);

  return {
    transform: transforms.join(" "),
    spoken,
    active,
    anticipating,
  };
}

export const DynamicCaptions: React.FC<Props> = ({ captions = [], cast = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / Math.max(1, fps);

  // 1. Verificação de segurança da lista
  if (!Array.isArray(captions) || captions.length === 0) {
    return null;
  }

  // 2. Localiza o bloco ativo
  const activeBlock = captions.find((c: any) => {
    if (!c || typeof c.start !== "number" || typeof c.end !== "number") return false;
    return currentTime >= c.start && currentTime <= c.end + 0.15;
  });

  if (!activeBlock || !Array.isArray(activeBlock.words) || activeBlock.words.length === 0) {
    return null;
  }

  // Identificação do tipo de áudio
  const blockType = activeBlock.type || "dialogue";
  const isMusic = blockType === "music";
  const isSFX = blockType === "sfx" || blockType === "sound";

  // Cor do orador
  const speakerId = activeBlock.speaker_id || activeBlock.speakerId || "S0";
  const speakerFromCast = Array.isArray(cast) ? cast.find((s: any) => s && s.id === speakerId) : null;
  const speakerColor = speakerFromCast?.color || FALLBACK_COLORS[speakerId] || "#27AE60";

  const normalizedCue = {
    ...activeBlock,
    type: blockType,
  };

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

        {activeBlock.words.map((w: Word, idx: number) => {
          if (!w || !w.text) return null;

          const fontSize = 44 * (w.size ?? 1.0);
          const motion = aeWordMotionState(normalizedCue, w, currentTime, fps, fontSize);

          let wordColor = motion.spoken ? speakerColor : "#FFFFFF";
          if (isSFX) {
            wordColor = "#FFD700";
          }

          return (
            <span
              key={`${activeBlock.id || "b"}-${idx}`}
              style={{
                fontFamily: `${fontFamily}, sans-serif`,
                fontWeight: 600,
                fontStyle: "normal",
                fontSize: `${fontSize}px`,
                lineHeight: 1.2,
                color: wordColor,
                display: "inline-block",
                transform: motion.transform,
                transformOrigin: "center center",
                letterSpacing: "-0.015em",
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