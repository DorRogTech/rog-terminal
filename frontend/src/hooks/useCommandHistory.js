import { useState, useCallback, useRef } from 'react';

const MAX_HISTORY = 50;
const STORAGE_KEY = 'rog_terminal_cmd_history';

/**
 * Hook managing command history (up to 50 entries).
 * Provides navigateUp, navigateDown, addCommand.
 * Stores in sessionStorage.
 */
export default function useCommandHistory() {
  const [history, setHistory] = useState(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const indexRef = useRef(-1);
  const draftRef = useRef('');

  const saveHistory = useCallback((h) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(h));
    } catch {}
  }, []);

  const addCommand = useCallback((cmd) => {
    if (!cmd || !cmd.trim()) return;
    setHistory((prev) => {
      // Avoid duplicating the last entry
      const filtered = prev.filter((c) => c !== cmd.trim());
      const next = [...filtered, cmd.trim()].slice(-MAX_HISTORY);
      saveHistory(next);
      indexRef.current = -1;
      draftRef.current = '';
      return next;
    });
  }, [saveHistory]);

  const navigateUp = useCallback((currentInput) => {
    let idx = indexRef.current;
    if (idx === -1) {
      // Save current input as draft
      draftRef.current = currentInput || '';
    }

    // history is stored oldest-first, navigate from the end
    const h = history;
    if (h.length === 0) return currentInput;

    if (idx === -1) {
      idx = h.length - 1;
    } else if (idx > 0) {
      idx = idx - 1;
    }

    indexRef.current = idx;
    return h[idx] || currentInput;
  }, [history]);

  const navigateDown = useCallback(() => {
    const h = history;
    let idx = indexRef.current;

    if (idx === -1) return draftRef.current;

    if (idx < h.length - 1) {
      idx = idx + 1;
      indexRef.current = idx;
      return h[idx];
    }

    // Back to draft
    indexRef.current = -1;
    return draftRef.current;
  }, [history]);

  const resetNavigation = useCallback(() => {
    indexRef.current = -1;
    draftRef.current = '';
  }, []);

  return { history, addCommand, navigateUp, navigateDown, resetNavigation };
}
