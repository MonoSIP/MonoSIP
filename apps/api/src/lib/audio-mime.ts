export function audioContentType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "wav") return "audio/wav";
  if (ext === "ogg" || ext === "opus") return "audio/ogg";
  if (ext === "mp3") return "audio/mpeg";
  return "application/octet-stream";
}

export function audioFilename(id: string, filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "wav";
  return `${id}.${ext}`;
}
