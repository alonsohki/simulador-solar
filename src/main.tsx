import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline } from '@mui/material';
import App from './App.tsx';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <CssBaseline />
    <App />
  </StrictMode>,
);
