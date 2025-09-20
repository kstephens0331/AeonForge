// Lightweight chunker for MVP: sentence-aware packing ~700 chars
export function chunkText(input: string, targetSize = 700): string[] {
  const text = input.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  // Split on blank lines first (paragraphs), then fallback to sentences.
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  let buf = "";

  const flush = () => {
    const b = buf.trim();
    if (b) chunks.push(b);
    buf = "";
  };

  const pushWithWrap = (piece: string) => {
    if ((buf + " " + piece).trim().length > targetSize) {
      flush();
      buf = piece;
    } else {
      buf = (buf ? buf + " " : "") + piece;
    }
  };

  for (const p of paragraphs) {
    if (p.length <= targetSize) {
      pushWithWrap(p);
      continue;
    }
    // Paragraph too big → split by sentence enders then words
    const sentences = p.split(/(?<=[\.\!\?])\s+/).filter(Boolean);
    for (const s of sentences) {
      if (s.length <= targetSize) {
        pushWithWrap(s);
      } else {
        // Very long sentence → hard wrap by words
        const words = s.split(/\s+/);
        let cur = "";
        for (const w of words) {
          if ((cur + " " + w).trim().length > targetSize) {
            pushWithWrap(cur);
            cur = w;
          } else {
            cur = (cur ? cur + " " : "") + w;
          }
        }
        if (cur) pushWithWrap(cur);
      }
    }
  }
  flush();
  return chunks;
}
