import { createContext, memo } from "react";
import { getSyntaxStyle, getTSClient } from "./syntax.js";

export const CodeExpandedContext = createContext(false);
export const CodeExpandedProvider = CodeExpandedContext.Provider;

interface Props {
  text: string;
  streaming?: boolean;
}

export const Markdown = memo(function Markdown({ text, streaming }: Props) {
  const syntaxStyle = getSyntaxStyle();
  const tsClient = getTSClient();

  return (
    <markdown
      content={text}
      syntaxStyle={syntaxStyle}
      treeSitterClient={tsClient}
      conceal
      streaming={streaming}
      tableOptions={{
        widthMode: "content",
        wrapMode: "word",
        borders: true,
        borderStyle: "rounded",
        borderColor: "#333",
        cellPadding: 0,
      }}
    />
  );
});
