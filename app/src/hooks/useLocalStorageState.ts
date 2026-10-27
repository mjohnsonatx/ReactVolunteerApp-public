// hooks/useLocalStorageState.js
import { useState, useEffect } from 'react';
import { logError } from '../utils/logError';

export function useLocalStorageState(key, initial) {
  const [value, setValue] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; }
    catch (e) { logError(e, `load-${key}`); return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { logError(e, `save-${key}`); }
  }, [key, value]);
  return [value, setValue];
}