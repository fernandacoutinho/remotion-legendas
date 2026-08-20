import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";
import { DynamicCaptions } from "./DynamicCaptions";
import captionsData from "./captions.json";

export const MyComposition = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000000",
        scale: 1.004,
      }}
      durationInFrames={3458}
      from={1217}
    >
      {/* Vídeo no fundo */}
      <OffthreadVideo
        src={staticFile("video.mp4")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      
      {/* Legendas com Intentions (CWI) */}
      <DynamicCaptions
        captions={captionsData.captions}
        cast={captionsData.cast}
      />
    </AbsoluteFill>
  );
};
