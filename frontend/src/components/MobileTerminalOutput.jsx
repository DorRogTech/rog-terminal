import React, { useEffect, useRef, useState, useCallback } from 'react';
import { parseAnsi } from '../utils/AnsiParser';

const MAX_LINES = 500;

/**
 * Chat-like scrollable output view replacing xterm canvas on mobile.
 * Uses AnsiParser to render ANSI-colored text as styled spans.
 * Auto-scrolls to bottom. Keeps last 500 lines.
 */
export default function MobileTerminalOutput({ outputBuffer }) {
  const containerRef = useRef(null);
  const [lines, setLines] = useState([]);
  const autoScrollRef = useRef(true);

  // Process incoming output buffer into lines
  useEffect(() => {
    if (!outputBuffer) return;

    setLines((prev) => {
      // Split output by newlines, handling \r\n and \r
      const raw = outputBuffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const newParts = raw.split('\n');

      // Merge first new part with last existing line (continuation)
      let updated = [...prev];
      if (updated.length > 0 && newParts.length > 0) {
        const lastIdx = updated.length - 1;
        updated[lastIdx] = updated[lastIdx] + newParts[0];
        for (let i = 1; i < newParts.length; i++) {
          updated.push(newParts[i]);
        }
      } else {
        updated = [...updated, ...newParts];
      }

      // Trim to MAX_LINES
      if (updated.length > MAX_LINES) {
        updated = updated.slice(updated.length - MAX_LINES);
      }

      return updated;
    });
  }, [outputBuffer]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  // Track scroll position to determine if user scrolled up
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScrollRef.current = atBottom;
  }, []);

  // Render a single line with ANSI colors
  const renderLine = useCallback((rawLine, idx) => {
    if (!rawLine) {
      return <div key={idx} className="mobile-term-line">&nbsp;</div>;
    }
    const segments = parseAnsi(rawLine);
    return (
      <div key={idx} className="mobile-term-line">
        {segments.map((seg, si) => {
          if (!seg.style) {
            return <span key={si}>{seg.text}</span>;
          }
          const style = {};
          if (seg.style.color) style.color = seg.style.color;
          if (seg.style.bg) style.backgroundColor = seg.style.bg;
          if (seg.style.bold) style.fontWeight = 'bold';
          if (seg.style.underline) style.textDecoration = 'underline';
          if (seg.style.dim) style.opacity = 0.6;
          if (seg.style.italic) style.fontStyle = 'italic';
          if (seg.style.inverse) {
            const fg = seg.style.color || '#e2e8f0';
            const bg = seg.style.bg || '#0a0e17';
            style.color = bg;
            style.backgroundColor = fg;
          }
          return <span key={si} style={style}>{seg.text}</span>;
        })}
      </div>
    );
  }, []);

  return (
    <div
      className="mobile-terminal-output"
      ref={containerRef}
      onScroll={handleScroll}
    >
      {lines.map((line, idx) => renderLine(line, idx))}
    </div>
  );
}
