import React from "react";
import { Composition } from "remotion";
import { MyComposition } from "./Composition";

export const RemotionRoot: React.FC = () => {
  const fps = 30;
  const duracaoEmSegundos = 247;

  return (
    <>
      <Composition
        id="LegendasDinamicas"
        component={MyComposition}
        durationInFrames={fps * duracaoEmSegundos}
        fps={fps}
        width={1920}
        height={1080}
      />
    </>
  );
};