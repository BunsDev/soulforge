type FileEditCallback = (absPath: string, content: string) => void;
type FileReadCallback = (absPath: string) => void;

const editListeners = new Set<FileEditCallback>();
const readListeners = new Set<FileReadCallback>();

export function onFileEdited(cb: FileEditCallback): () => void {
  editListeners.add(cb);
  return () => {
    editListeners.delete(cb);
  };
}

export function onFileRead(cb: FileReadCallback): () => void {
  readListeners.add(cb);
  return () => {
    readListeners.delete(cb);
  };
}

export function emitFileEdited(absPath: string, content: string): void {
  for (const cb of editListeners) cb(absPath, content);
}

export function emitFileRead(absPath: string): void {
  for (const cb of readListeners) cb(absPath);
}
