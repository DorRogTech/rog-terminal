import bidiFactory from 'bidi-js';

const bidi = bidiFactory();
const HEBREW_ARABIC_RE = /[\u0590-\u05FF\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

export function processBidi(data) {
  if (!data || !HEBREW_ARABIC_RE.test(data)) return data;

  // Process line by line
  return data.split('\n').map(line => {
    if (!HEBREW_ARABIC_RE.test(line)) return line;

    // Strip ANSI codes, remember positions
    const ansiCodes = [];
    const cleanLine = line.replace(ANSI_RE, (match, offset) => {
      const prevAnsiLength = ansiCodes.reduce((sum, a) => sum + a.code.length, 0);
      ansiCodes.push({ code: match, cleanPosition: offset - prevAnsiLength });
      return '';
    });

    if (!cleanLine) return line;

    // Build segments: each character with any ANSI codes that precede it
    const segments = [];
    let ansiIdx = 0;
    for (let i = 0; i < cleanLine.length; i++) {
      let ansi = '';
      while (ansiIdx < ansiCodes.length && ansiCodes[ansiIdx].cleanPosition === i) {
        ansi += ansiCodes[ansiIdx].code;
        ansiIdx++;
      }
      segments.push({ ansi, char: cleanLine[i] });
    }
    // Collect any trailing ANSI codes (after all characters)
    let trailingAnsi = '';
    while (ansiIdx < ansiCodes.length) {
      trailingAnsi += ansiCodes[ansiIdx].code;
      ansiIdx++;
    }

    // Use bidi-js to get embedding levels and reorder map
    const embeddingLevels = bidi.getEmbeddingLevels(cleanLine, 'auto');

    // Get the reorder map: maps visual position -> logical position
    const reorderMap = bidi.getReorderedIndices(cleanLine, embeddingLevels);

    // If no ANSI codes, just return the simple reordered string
    if (ansiCodes.length === 0) {
      return bidi.getReorderedString(cleanLine, embeddingLevels);
    }

    // Reorder segments using the map and reconstruct
    let result = '';
    for (let vi = 0; vi < reorderMap.length; vi++) {
      const li = reorderMap[vi];
      result += segments[li].ansi + segments[li].char;
    }
    result += trailingAnsi;

    return result;
  }).join('\n');
}
