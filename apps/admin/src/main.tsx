import '@yh/ui/tokens.css';
import './global.css';
import '@yh/ui/select.css';
import './shell.css';
import './controls.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
