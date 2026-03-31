import { memo } from "react";
import { icon } from "../../../../core/icons.js";
import { useTheme } from "../../../../core/theme/index.js";
import { PopupRow, usePopupColors } from "../../../layout/shared.js";
import { INTELLIGENCE_ITEMS } from "../data.js";
import { Gap, StepHeader } from "../primitives.js";
import { BOLD } from "../theme.js";

export const IntelligenceStep = memo(function IntelligenceStep({ iw }: { iw: number }) {
  const t = useTheme();
  const { bg } = usePopupColors();
  return (
    <>
      <Gap iw={iw} />
      <StepHeader iw={iw} ic={icon("brain")} title="Codebase Intelligence" />
      <Gap iw={iw} />

      <PopupRow w={iw}>
        <text fg={t.textSecondary} bg={bg}>
          {"  "}SoulForge understands your code before the AI even reads it:
        </text>
      </PopupRow>

      {INTELLIGENCE_ITEMS.map((item) => (
        <box key={item.cmd} flexDirection="column" backgroundColor={bg}>
          <Gap iw={iw} />
          <PopupRow w={iw}>
            <text fg={t.brand} bg={bg}>
              {"  "}
              {icon(item.ic)}{" "}
            </text>
            <text fg={t.textPrimary} attributes={BOLD} bg={bg}>
              {item.title}
            </text>
            <text fg={t.info} bg={bg}>
              {"  "}
              {item.cmd}
            </text>
          </PopupRow>
          <PopupRow w={iw}>
            <text fg={t.textSecondary} bg={bg}>
              {"      "}
              {item.desc}
            </text>
          </PopupRow>
          {item.bullets.map((b) => (
            <PopupRow key={b} w={iw}>
              <text fg={t.textDim} bg={bg}>
                {"      "}
                <span fg={t.textFaint}>•</span> {b}
              </text>
            </PopupRow>
          ))}
        </box>
      ))}
    </>
  );
});
