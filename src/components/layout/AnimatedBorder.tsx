import { memo } from "react";
import { useTheme } from "../../core/theme/index.js";

interface AnimatedBorderProps {
  active: boolean;
  children: React.ReactNode;
  idleColor?: string;
}

export const AnimatedBorder = memo(function AnimatedBorder({
  active,
  children,
  idleColor,
}: AnimatedBorderProps) {
  const t = useTheme();
  return (
    <box
      flexGrow={1}
      flexShrink={1}
      minHeight={0}
      border
      borderStyle="rounded"
      borderColor={active ? t.brandSecondary : (idleColor ?? t.textSubtle)}
    >
      {children}
    </box>
  );
});
