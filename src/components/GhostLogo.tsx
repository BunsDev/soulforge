import { TextAttributes } from "@opentui/core";
import { useEffect, useState } from "react";
import { icon } from "../core/icons.js";
import { BRAND_DIM_PURPLE, BRAND_PURPLE, WISP_FRAMES } from "./splash.js";

const GHOST = () => icon("ghost");
const SPEED = 500;

export function GhostLogo() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, SPEED);
    return () => clearInterval(timer);
  }, []);

  const wispFrame = WISP_FRAMES[tick % WISP_FRAMES.length] ?? WISP_FRAMES[0];

  return (
    <box flexDirection="column" alignItems="center">
      <text fg={BRAND_PURPLE}>
        <b>{GHOST()}</b>
      </text>
      <text fg={BRAND_DIM_PURPLE} attributes={TextAttributes.DIM}>
        {wispFrame}
      </text>
    </box>
  );
}
