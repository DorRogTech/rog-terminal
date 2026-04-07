/**
 * Convert ANSI terminal output to HTML with colors.
 * Handles cursor movement, screen clearing, and color codes.
 * Output uses unicode-bidi: plaintext for native RTL support.
 */

const COLORS_FG = {
  30: '#1a2236', 31: '#ef4444', 32: '#22c55e', 33: '#f59e0b',
  34: '#3b82f6', 35: '#a78bfa', 36: '#06b6d4', 37: '#e2e8f0',
  90: '#64748b', 91: '#f87171', 92: '#4ade80', 93: '#fbbf24',
  94: '#60a5fa', 95: '#c4b5fd', 96: '#22d3ee', 97: '#f8fafc',
};

/**
 * Simple virtual screen that handles ANSI sequences
 * and produces clean HTML output.
 */
export function ansiToHtml(raw) {
  // Collect all visible text lines, stripping complex cursor positioning
  const lines = [];
  let currentLine = '';
  let currentStyle = null;
  let i = 0;

  function escapeHtml(ch) {
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === '&') return '&amp;';
    return ch;
  }

  function openSpan(style) {
    if (!style) return '';
    const parts = [];
    if (style.color) parts.push(`color:${style.color}`);
    if (style.bg) parts.push(`background:${style.bg}`);
    if (style.bold) parts.push('font-weight:bold');
    if (style.dim) parts.push('opacity:0.6');
    if (style.italic) parts.push('font-style:italic');
    if (style.underline) parts.push('text-decoration:underline');
    if (style.inverse) {
      // Swap fg/bg
      const c = style.color || '#e2e8f0';
      const b = style.bg || '#0a0e17';
      parts.length = 0;
      parts.push(`color:${b}`, `background:${c}`);
      if (style.bold) parts.push('font-weight:bold');
    }
    return parts.length ? `<span style="${parts.join(';')}">` : '';
  }

  function flushLine() {
    if (currentStyle) {
      currentLine += '</span>';
      currentStyle = null;
    }
    lines.push(currentLine);
    currentLine = '';
  }

  while (i < raw.length) {
    const ch = raw[i];

    // ESC sequence
    if (ch === '\x1b') {
      // CSI sequence: ESC [ ... letter
      if (raw[i + 1] === '[') {
        const seqStart = i + 2;
        let seqEnd = seqStart;
        // Find the terminating letter
        while (seqEnd < raw.length && !(/[A-Za-z]/.test(raw[seqEnd]))) {
          seqEnd++;
        }
        if (seqEnd >= raw.length) { i++; continue; }

        const params = raw.substring(seqStart, seqEnd);
        const command = raw[seqEnd];
        i = seqEnd + 1;

        switch (command) {
          case 'm': {
            // SGR - colors and styles
            const codes = params ? params.split(';').map(Number) : [0];

            // Close previous span
            if (currentStyle) {
              currentLine += '</span>';
              currentStyle = null;
            }

            const style = {};
            for (const code of codes) {
              if (code === 0) { /* reset */ }
              else if (code === 1) style.bold = true;
              else if (code === 2) style.dim = true;
              else if (code === 3) style.italic = true;
              else if (code === 4) style.underline = true;
              else if (code === 7) style.inverse = true;
              else if (code >= 30 && code <= 37) style.color = COLORS_FG[code];
              else if (code >= 90 && code <= 97) style.color = COLORS_FG[code];
              else if (code === 38) {
                // 256 color or RGB: 38;2;r;g;b or 38;5;n
                const nextCodes = codes.slice(codes.indexOf(38) + 1);
                if (nextCodes[0] === 2 && nextCodes.length >= 4) {
                  style.color = `rgb(${nextCodes[1]},${nextCodes[2]},${nextCodes[3]})`;
                }
                break; // Skip remaining codes in this sequence
              }
            }

            if (Object.keys(style).length > 0) {
              currentStyle = style;
              currentLine += openSpan(style);
            }
            break;
          }

          case 'J': {
            // Clear screen
            if (params === '2' || params === '3') {
              lines.length = 0;
              currentLine = '';
            }
            break;
          }

          case 'H': {
            // Cursor position - treat as newline
            flushLine();
            break;
          }

          case 'K': {
            // Clear line (from cursor) - ignore
            break;
          }

          case 'A': case 'B': case 'C': case 'D':
          case 'E': case 'F': case 'G':
            // Cursor movement - ignore
            break;

          default:
            // Other CSI sequences - ignore
            break;
        }
        continue;
      }

      // OSC sequence: ESC ] ... BEL or ST
      if (raw[i + 1] === ']') {
        // Skip until BEL (\x07) or ST (ESC \)
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

    // Newline
    if (ch === '\n') {
      flushLine();
      i++;
      continue;
    }

    // Carriage return
    if (ch === '\r') {
      i++;
      continue;
    }

    // BEL
    if (ch === '\x07') { i++; continue; }

    // Other control chars
    if (ch.charCodeAt(0) < 32) { i++; continue; }

    // Regular character
    currentLine += escapeHtml(ch);
    i++;
  }

  // Flush last line
  if (currentStyle) currentLine += '</span>';
  if (currentLine) lines.push(currentLine);

  // Filter out empty lines at the start, keep content
  let startIdx = 0;
  while (startIdx < lines.length && lines[startIdx].replace(/<[^>]*>/g, '').trim() === '') {
    startIdx++;
  }

  return lines
    .slice(startIdx)
    .map(line => `<div class="term-line" dir="auto">${line || '&nbsp;'}</div>`)
    .join('');
}
