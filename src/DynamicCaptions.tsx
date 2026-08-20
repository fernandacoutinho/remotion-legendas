import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

export interface Word {
  text: string;
  start: number;
  end: number;
  weight?: number;
  size?: number;
  emphasis?: number | boolean;
  pitch?: number;
  volume?: number;
}

export interface CaptionBlock {
  id: string;
  start: number;
  end: number;
  speaker_id?: string;
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

const FALLBACK_COLORS: Record<string, string> = {
  S0: "#27AE60",
  S1: "#F5A623",
  S2: "#BD10E0",
  S3: "#00C2FF",
};

export const DynamicCaptions: React.FC<Props> = ({ captions = [], cast = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / Math.max(1, fps);

  // 1. Verificação de segurança da lista
  if (!Array.isArray(captions) || captions.length === 0) {
    return null;
  }

  // 2. Localiza o bloco ativo com tolerância
  const activeBlock = captions.find((c: any) => {
    if (!c || typeof c.start !== "number" || typeof c.end !== "number") return false;
    return currentTime >= c.start && currentTime <= c.end + 0.15;
  });

  if (!activeBlock || !Array.isArray(activeBlock.words) || activeBlock.words.length === 0) {
    return null;
  }

  // Cor do orador
  const speakerId = activeBlock.speaker_id || "S0";
  const speakerFromCast = Array.isArray(cast) ? cast.find((s: any) => s && s.id === speakerId) : null;
  const speakerColor = speakerFromCast?.color || FALLBACK_COLORS[speakerId] || "#27AE60";

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
          backgroundColor: "rgba(0, 0, 0, 0.90)",
          padding: "18px 36px",
          borderRadius: "8px",
          display: "flex",
          justifyContent: "center",
          alignItems: "baseline",
          flexWrap: "wrap",
          columnGap: "16px",
          rowGap: "12px",
          maxWidth: "92%",
          boxShadow: "0 10px 32px rgba(0, 0, 0, 0.8)",
        }}
      >
        {activeBlock.words.map((w: Word, idx: number) => {
          if (!w || !w.text) return null;

          const wStart = typeof w.start === "number" ? w.start : 0;
          // Garante que end seja estritamente maior que start para não quebrar a física
          const wEnd = typeof w.end === "number" && w.end > wStart ? w.end : wStart + 0.2;

          const isActive = currentTime >= wStart && currentTime <= wEnd;
          const isPast = currentTime > wEnd;

          // Normalização contínua de ênfase (0.0 a 1.0)
          let e = 0.25;
          if (typeof w.emphasis === "number") {
            e = Math.max(0, Math.min(1.5, w.emphasis));
          } else if (typeof w.emphasis === "boolean") {
            e = w.emphasis ? 0.9 : 0.25;
          }

          // Animação de pop
          const wordFrameOffset = Math.max(0, Math.round((currentTime - wStart) * fps));
          const popSpring = spring({
            frame: wordFrameOffset,
            fps,
            config: { damping: 12, stiffness: 200, mass: 0.5 },
          });

          // Aumento contínuo de tamanho (escala pura, sem negrito e sem caps)
          const targetScaleY = 0.9 + e * 0.95;
          const targetScaleX = 0.92 + e * 0.4;
          const targetTranslateY = -Math.round(e * 8);

          let currentScaleX = 1.0;
          let currentScaleY = 1.0;
          let currentTranslateY = 0;

          if (isActive) {
            currentScaleX = interpolate(popSpring, [0, 1], [1.0, targetScaleX], { extrapolateRight: "clamp" });
            currentScaleY = interpolate(popSpring, [0, 1], [1.0, targetScaleY], { extrapolateRight: "clamp" });
            currentTranslateY = interpolate(popSpring, [0, 1], [0, targetTranslateY], { extrapolateRight: "clamp" });
          } else if (isPast) {
            currentScaleX = 1.0 + e * 0.05;
            currentScaleY = 1.0 + e * 0.08;
            currentTranslateY = 0;
          }

          const wordColor = isActive || isPast ? speakerColor : "#FFFFFF";

          return (
            <span
              key={`${activeBlock.id || "b"}-${idx}`}
              style={{
                fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                fontWeight: 600,
                fontSize: `${44 * (w.size ?? 1.0)}px`,
                lineHeight: 1.2,
                color: wordColor,
                display: "inline-block",
                transform: `scale(${currentScaleX}, ${currentScaleY}) translateY(${currentTranslateY}px)`,
                transformOrigin: "center bottom",
                letterSpacing: "-0.015em",
                textShadow: "none",
                textTransform: "none",
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