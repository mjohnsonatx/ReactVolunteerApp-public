import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { logError } from './utils/logError';

// Catch async/global errors React boundaries can't see
window.addEventListener('error', e => logError(e.error || e.message, 'window.onerror'));
window.addEventListener('unhandledrejection', e => logError(e.reason, 'unhandledrejection'));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
