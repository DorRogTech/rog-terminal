/**
 * ANSI escape code parser.
 * Converts raw terminal output into an array of { text, style } objects.
 * Handles SGR codes for colors (standard 8 + bright), bold, underline, reset.
 * Color values match the theme defined in SharedTerminal.jsx.
 */

const COLORS = {
  0: '#1a2236',   // black
  1: '#ef4444',   // red
  2: '#22c55e',   // green
  3: '#f59e0b',   // yellow
  4: '#3b82f6',   // blue
  5: '#a78bfa',   // magenta
  6: '#06b6d4',   // cyan
  7: '#e2e8f0',   // white
  8: '#64748b',   // brightBlack
  9: '#f87171',   // brightRed
  10: '#4ade80',  // brightGreen
  11: '#fbbf24',  // brightYellow
  12: '#60a5fa',  // brightBlue
  13: '#c4b5fd',  // brightMagenta
  14: '#22d3ee',  // brightCyan
  15: '#f8fafc',  // brightWhite
};

function colorForCode(code) {
  if (code >= 30 && code <= 37) return COLORS[code - 30];
  if (code >= 90 && code <= 97) return COLORS[code - 90 + 8];
  return null;
}

function bgColorForCode(code) {
  if (code >= 40 && code <= 47) return COLORS[code - 40];
  if (code >= 100 && code <= 107) return COLORS[code - 100 + 8];
  return null;
}

/**
 * Parse raw ANSI text into an array of { text, style } segments.
 * style = { color, bg, bold, underline, dim, italic, inverse }
 *
 * @param {string} raw - Raw terminal text with ANSI codes
 * @returns {Array<{text: string, style: object|null}>}
 */
export function parseAnsi(raw) {
  if (!raw) return [];

  const segments = [];
  let currentStyle = {};
  let buffer = '';
  let i = 0;

  function flushBuffer() {
    if (buffer.length > 0) {
      const hasStyle = Object.keys(currentStyle).length > 0;
      segments.push({ text: buffer, style: hasStyle ? { ...currentStyle } : null });
      buffer = '';
    }
  }

  while (i < raw.length) {
    const ch = raw[i];

    // ESC sequence
    if (ch === '\x1b') {
      // CSI sequence: ESC [ ... letter
      if (raw[i + 1] === '[') {
        const seqStart = i + 2;
        let seqEnd = seqStart;
        while (seqEnd < raw.length && !(/[A-Za-z]/.test(raw[seqEnd]))) {
          seqEnd++;
        }
        if (seqEnd >= raw.length) { i++; continue; }

        const params = raw.substring(seqStart, seqEnd);
        const command = raw[seqEnd];
        i = seqEnd + 1;

        if (command === 'm') {
          // SGR
          flushBuffer();
          const codes = params ? params.split(';').map(Number) : [0];
          let ci = 0;
          while (ci < codes.length) {
            const code = codes[ci];
            if (code === 0) {
              currentStyle = {};
            } else if (code === 1) {
              currentStyle.bold = true;
            } else if (code === 2) {
              currentStyle.dim = true;
            } else if (code === 3) {
              currentStyle.italic = true;
            } else if (code === 4) {
              currentStyle.underline = true;
            } else if (code === 7) {
              currentStyle.inverse = true;
            } else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
              currentStyle.color = colorForCode(code);
            } else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
              currentStyle.bg = bgColorForCode(code);
            } else if (code === 38) {
              // Extended foreground: 38;5;n or 38;2;r;g;b
              if (codes[ci + 1] === 5 && ci + 2 < codes.length) {
                const n = codes[ci + 2];
                currentStyle.color = color256(n);
                ci += 2;
              } else if (codes[ci + 1] === 2 && ci + 4 < codes.length) {
                currentStyle.color = `rgb(${codes[ci + 2]},${codes[ci + 3]},${codes[ci + 4]})`;
                ci += 4;
              }
            } else if (code === 48) {
              // Extended background: 48;5;n or 48;2;r;g;b
              if (codes[ci + 1] === 5 && ci + 2 < codes.length) {
                const n = codes[ci + 2];
                currentStyle.bg = color256(n);
                ci += 2;
              } else if (codes[ci + 1] === 2 && ci + 4 < codes.length) {
                currentStyle.bg = `rgb(${codes[ci + 2]},${codes[ci + 3]},${codes[ci + 4]})`;
                ci += 4;
              }
            } else if (code === 39) {
              delete currentStyle.color;
            } else if (code === 49) {
              delete currentStyle.bg;
            }
            ci++;
          }
        }
        // Other CSI commands (J, K, H, cursor movement) — skip silently
        continue;
      }

      // OSC sequence: ESC ] ... BEL or ST
      if (raw[i + 1] === ']') {
        let j = i + 2;
        while (j < raw.length) {
          if (raw[j] === '\x07') { j++; break; }
          if (raw[j] === '\x1b' && raw[j + 1] === '\\') { j += 2; break; }
          j++;
        }
        i = j;
        continue;
      }

      // Other ESC sequences - skip until letter
      let j = i + 1;
      while (j < raw.length && !(/[a-zA-Z]/.test(raw[j]))) j++;
      i = j + 1;
      continue;
    }

    // BEL
    if (ch === '\x07') { i++; continue; }

    // Other control chars except \n, \r, \t
    if (ch.charCodeAt(0) < 32 && ch !== '\n' && ch !== '\r' && ch !== '\t') {
      i++;
      continue;
    }

    buffer += ch;
    i++;
  }

  flushBuffer();
  return segments;
}

/**
 * Convert 256-color index to hex color.
 */
function color256(n) {
  if (n < 16) {
    return COLORS[n] || '#e2e8f0';
  }
  if (n < 232) {
    // 6x6x6 color cube
    const idx = n - 16;
    const r = Math.floor(idx / 36);
    const g = Math.floor((idx % 36) / 6);
    const b = idx % 6;
    const toVal = (v) => v === 0 ? 0 : 55 + v * 40;
    return `rgb(${toVal(r)},${toVal(g)},${toVal(b)})`;
  }
  // Grayscale ramp
  const level = 8 + (n - 232) * 10;
  return `rgb(${level},${level},${level})`;
}

export default parseAnsi;
