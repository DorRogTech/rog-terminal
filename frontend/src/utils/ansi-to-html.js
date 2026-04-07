/**
 * Convert ANSI escape codes to HTML spans with colors.
 * Preserves text as-is so the browser handles BiDi natively.
 */

const ANSI_COLORS = {
  30: '#1a2236', 31: '#ef4444', 32: '#22c55e', 33: '#f59e0b',
  34: '#3b82f6', 35: '#a78bfa', 36: '#06b6d4', 37: '#e2e8f0',
  90: '#64748b', 91: '#f87171', 92: '#4ade80', 93: '#fbbf24',
  94: '#60a5fa', 95: '#c4b5fd', 96: '#22d3ee', 97: '#f8fafc',
};

const ANSI_BG_COLORS = {
  40: '#1a2236', 41: '#ef4444', 42: '#22c55e', 43: '#f59e0b',
  44: '#3b82f6', 45: '#a78bfa', 46: '#06b6d4', 47: '#e2e8f0',
};

export function ansiToHtml(text) {
  let result = '';
  let i = 0;
  let currentStyles = {};

  while (i < text.length) {
    // Check for ANSI escape sequence
    if (text[i] === '\x1b' && text[i + 1] === '[') {
      const end = text.indexOf('m', i + 2);
      if (end !== -1) {
        const codes = text.substring(i + 2, end).split(';').map(Number);

        for (const code of codes) {
          if (code === 0) {
            // Reset
            if (Object.keys(currentStyles).length > 0) {
              result += '</span>';
              currentStyles = {};
            }
          } else if (code === 1) {
            currentStyles.bold = true;
          } else if (code === 2) {
            currentStyles.dim = true;
          } else if (code === 3) {
            currentStyles.italic = true;
          } else if (code === 4) {
            currentStyles.underline = true;
          } else if (ANSI_COLORS[code]) {
            currentStyles.color = ANSI_COLORS[code];
          } else if (ANSI_BG_COLORS[code]) {
            currentStyles.bg = ANSI_BG_COLORS[code];
          }
        }

        // Build style string
        if (Object.keys(currentStyles).length > 0) {
          const parts = [];
          if (currentStyles.color) parts.push(`color:${currentStyles.color}`);
          if (currentStyles.bg) parts.push(`background:${currentStyles.bg}`);
          if (currentStyles.bold) parts.push('font-weight:bold');
          if (currentStyles.dim) parts.push('opacity:0.6');
          if (currentStyles.italic) parts.push('font-style:italic');
          if (currentStyles.underline) parts.push('text-decoration:underline');
          result += `<span style="${parts.join(';')}">`;
        }

        i = end + 1;
        continue;
      }
    }

    // Skip other escape sequences (cursor movement, etc.)
    if (text[i] === '\x1b') {
      const seqEnd = text.substring(i).search(/[A-Za-z]/);
      if (seqEnd > 0) {
        i += seqEnd + 1;
        continue;
      }
    }

    // Regular character - escape HTML
    const ch = text[i];
    if (ch === '<') result += '&lt;';
    else if (ch === '>') result += '&gt;';
    else if (ch === '&') result += '&amp;';
    else if (ch === '\n') result += '<br/>';
    else if (ch === '\r') { /* skip */ }
    else result += ch;

    i++;
  }

  // Close any open spans
  if (Object.keys(currentStyles).length > 0) {
    result += '</span>';
  }

  return result;
}
