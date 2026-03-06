import { useCallback, useState } from "react";
import type { FocusMode } from "../types/index.js";

interface UseEditorFocusReturn {
  focusMode: FocusMode;
  editorOpen: boolean;
  toggleEditor: () => void;
  switchFocus: () => void;
  openEditor: () => void;
  closeEditor: () => void;
  focusChat: () => void;
  focusEditor: () => void;
}

export function useEditorFocus(): UseEditorFocusReturn {
  const [focusMode, setFocusMode] = useState<FocusMode>("chat");
  const [editorOpen, setEditorOpen] = useState(false);

  const toggleEditor = useCallback(() => {
    if (editorOpen) {
      setEditorOpen(false);
      setFocusMode("chat");
    } else {
      setEditorOpen(true);
      setFocusMode("editor");
    }
  }, [editorOpen]);

  const switchFocus = useCallback(() => {
    if (!editorOpen) return;
    setFocusMode((prev) => (prev === "editor" ? "chat" : "editor"));
  }, [editorOpen]);

  const openEditor = useCallback(() => {
    if (!editorOpen) {
      setEditorOpen(true);
      setFocusMode("editor");
    }
  }, [editorOpen]);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setFocusMode("chat");
  }, []);

  const focusChat = useCallback(() => {
    setFocusMode("chat");
  }, []);

  const focusEditor = useCallback(() => {
    if (editorOpen) setFocusMode("editor");
  }, [editorOpen]);

  return {
    focusMode,
    editorOpen,
    toggleEditor,
    switchFocus,
    openEditor,
    closeEditor,
    focusChat,
    focusEditor,
  };
}
