import '@yh/ui/tokens.css';
import '@yh/ui/select.css';
import './global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { signalReady } from './telegram';

signalReady();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
