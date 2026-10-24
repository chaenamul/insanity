import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameLoader } from './GameLoader';
import './game.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameLoader />
  </StrictMode>,
);
