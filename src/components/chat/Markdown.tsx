import { createContext, memo, useContext, useMemo } from "react";
import { useTheme } from "../../core/theme/index.js";
import { getSyntaxStyle, getTSClient } from "../../core/utils/syntax.js";

const CodeExpandedContext = createContext(false);
export const CodeExpandedProvider = CodeExpandedContext.Provider;
export function useCodeExpanded(): boolean {
  return useContext(CodeExpandedContext);
}

interface Props {
  text: string;
  streaming?: boolean;
}

export const Markdown = memo(function Markdown({ text, streaming }: Props) {
  const t = useTheme();
  const syntaxStyle = getSyntaxStyle();
  const tsClient = getTSClient();

  const tableOptions = useMemo(
    () => ({
      widthMode: "content" as const,
      wrapMode: "word" as const,
      borders: true,
      borderStyle: "rounded" as const,
      borderColor: t.textFaint,
      cellPadding: 0,
    }),
    [t.textFaint],
  );

  return (
    <markdown
      content={text}
      syntaxStyle={syntaxStyle}
      treeSitterClient={tsClient}
      conceal
      streaming={streaming}
      tableOptions={tableOptions}
    />
  );
});
