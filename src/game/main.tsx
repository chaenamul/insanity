import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameLoader } from './GameLoader';
import './colors.css';
import './game.css';

// 플레이 화면에서는 아무것도 끌 수 없다 (링크/글자를 끌어 다른 곳에 놓기 등)
document.addEventListener('dragstart', (e) => e.preventDefault());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameLoader />
  </StrictMode>,
);
