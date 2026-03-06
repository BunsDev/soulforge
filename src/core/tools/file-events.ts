type FileEditCallback = (absPath: string, content: string) => void;
type FileReadCallback = (absPath: string) => void;

const editListeners = new Set<FileEditCallback>();
const readListeners = new Set<FileReadCallback>();

export function setFileEventHandlers(handlers: {
  onFileEdited?: FileEditCallback;
  onFileRead?: FileReadCallback;
}): void {
  editListeners.clear();
  readListeners.clear();
  if (handlers.onFileEdited) editListeners.add(handlers.onFileEdited);
  if (handlers.onFileRead) readListeners.add(handlers.onFileRead);
}

export function onFileEditedEvent(cb: FileEditCallback): () => void {
  editListeners.add(cb);
  return () => {
    editListeners.delete(cb);
  };
}

export function emitFileEdited(absPath: string, content: string): void {
  for (const cb of editListeners) cb(absPath, content);
}

export function emitFileRead(absPath: string): void {
  for (const cb of readListeners) cb(absPath);
}
