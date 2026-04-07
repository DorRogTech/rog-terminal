/**
 * BiDi (Bidirectional) text processor for terminal output.
 *
 * xterm.js renders text left-to-right on a character grid.
 * Hebrew text needs to be reversed so it displays correctly.
 *
 * This processor:
 * 1. Detects Hebrew character segments
 * 2. Reverses them so they appear RTL in an LTR terminal
 * 3. Preserves ANSI escape codes
 */

// Hebrew Unicode range
const HEBREW_RE = /[\u0590-\u05FF\uFB1D-\uFB4F]/;
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

/**
 * Check if a character is Hebrew
 */
function isHebrew(ch) {
  return HEBREW_RE.test(ch);
}

/**
 * Check if character is RTL (Hebrew, Arabic, etc.)
 */
function isRTL(ch) {
  const code = ch.charCodeAt(0);
  return (
    (code >= 0x0590 && code <= 0x05FF) || // Hebrew
    (code >= 0xFB1D && code <= 0xFB4F) || // Hebrew Presentation Forms
    (code >= 0x0600 && code <= 0x06FF) || // Arabic
    (code >= 0xFE70 && code <= 0xFEFF)    // Arabic Presentation Forms
  );
}

/**
 * Check if character is neutral (spaces, punctuation that should follow text direction)
 */
function isNeutral(ch) {
  return /^[\s.,;:!?()[\]{}"'`\-=+*/\\|<>@#$%^&~_\d]$/.test(ch);
}

/**
 * Process a single line of text for BiDi display in LTR terminal.
 * Reverses Hebrew segments so they appear correctly.
 */
function processLine(line) {
  // Strip ANSI codes, process text, then re-insert them
  const ansiPositions = [];
  let cleanLine = '';
  let lastIndex = 0;

  let match;
  const ansiRegex = /\x1b\[[0-9;]*[a-zA-Z]/g;
  while ((match = ansiRegex.exec(line)) !== null) {
    cleanLine += line.substring(lastIndex, match.index);
    ansiPositions.push({ cleanPos: cleanLine.length, code: match[0] });
    lastIndex = match.index + match[0].length;
  }
  cleanLine += line.substring(lastIndex);

  // Split into runs of RTL, LTR, and neutral characters
  const runs = [];
  let currentRun = '';
  let currentType = null; // 'rtl', 'ltr', 'neutral'

  for (const ch of cleanLine) {
    let type;
    if (isRTL(ch)) type = 'rtl';
    else if (isNeutral(ch)) type = 'neutral';
    else type = 'ltr';

    if (type === currentType || currentType === null) {
      currentRun += ch;
      currentType = type === 'neutral' ? currentType : type;
    } else if (type === 'neutral') {
      currentRun += ch;
    } else {
      if (currentRun) runs.push({ text: currentRun, type: currentType || 'ltr' });
      currentRun = ch;
      currentType = type;
    }
  }
  if (currentRun) runs.push({ text: currentRun, type: currentType || 'ltr' });

  // Check if the line is predominantly RTL
  const rtlChars = cleanLine.split('').filter(isRTL).length;
  const totalChars = cleanLine.replace(/\s/g, '').length;
  const isRTLLine = rtlChars > totalChars * 0.3;

  // Process runs
  let result = '';
  for (const run of runs) {
    if (run.type === 'rtl') {
      // Reverse the Hebrew text
      result += [...run.text].reverse().join('');
    } else {
      result += run.text;
    }
  }

  // If line is predominantly RTL, reverse the order of all runs
  if (isRTLLine && runs.length > 1) {
    const processedRuns = runs.map(run => {
      if (run.type === 'rtl') {
        return run.text; // Keep Hebrew as-is (already in correct order for RTL reading)
      }
      return run.text;
    });
    result = processedRuns.reverse().join('');
  }

  // Re-insert ANSI codes
  if (ansiPositions.length > 0) {
    let finalResult = '';
    let cleanIdx = 0;
    let ansiIdx = 0;

    for (let i = 0; i < result.length; i++) {
      while (ansiIdx < ansiPositions.length && ansiPositions[ansiIdx].cleanPos === cleanIdx) {
        finalResult += ansiPositions[ansiIdx].code;
        ansiIdx++;
      }
      finalResult += result[i];
      cleanIdx++;
    }
    // Append remaining ANSI codes
    while (ansiIdx < ansiPositions.length) {
      finalResult += ansiPositions[ansiIdx].code;
      ansiIdx++;
    }
    return finalResult;
  }

  return result;
}

/**
 * Process terminal output for BiDi display.
 * Handles multi-line output and preserves control sequences.
 */
export function processBidi(data) {
  // Don't process pure control sequences
  if (!HEBREW_RE.test(data)) return data;

  // Split by lines, process each, rejoin
  const lines = data.split('\n');
  return lines.map(line => {
    // Don't process lines that are only ANSI codes or empty
    const stripped = line.replace(ANSI_RE, '').trim();
    if (!stripped || !HEBREW_RE.test(stripped)) return line;
    return processLine(line);
  }).join('\n');
}
