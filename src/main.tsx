import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { PinballSimulator } from './components/PinballSimulator';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in index.html');
}

// ?simulator=1 swaps the entire app for the pinball-panel sandbox so we
// can tune the activity-box copy, animations, and timings without
// playing through a full game to reach each state.
const isSimulator = new URLSearchParams(window.location.search).has('simulator');

createRoot(rootEl).render(
  <StrictMode>
    {isSimulator ? (
      <PinballSimulator />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>
);
