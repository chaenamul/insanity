import { useCallback, useEffect, useMemo, useState } from 'react';
import { choose, getView, isStateCompatible, newRun, proceed } from '../engine/run';
import type { GameContent, RunState } from '../engine/types';
import { RichText } from '../shared/RichText';
import { loadPlaytestContent, readStorage, STORAGE_KEYS, writeStorage } from '../shared/storage';
import { loadBundledContent } from './bundledContent';
import { DebugPanel } from './DebugPanel';
import { EncounterView } from './EncounterView';
import { EndingView } from './EndingView';
import { Inventory, StatusBar } from './StatusBar';

interface SavedRun {
  /** 테스트 플레이 토큰 (에디터에서 새로 열 때마다 바뀜) */
  token: string | null;
  state: RunState;
}

export function GameApp() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const playtestToken = params.get('playtest');
  const isPlaytest = playtestToken != null;
  const runKey = isPlaytest ? STORAGE_KEYS.playtestRun : STORAGE_KEYS.run;

  const [content, setContent] = useState<GameContent>(() => (isPlaytest && loadPlaytestContent()) || loadBundledContent());
  const [run, setRun] = useState<RunState | null>(() => {
    if (!isPlaytest) return null;
    const saved = readStorage<SavedRun>(runKey);
    if (saved && saved.token === playtestToken && isStateCompatible(content, saved.state)) return saved.state;
    return newRun(content, { startEncounterId: params.get('start') ?? undefined });
  });
  const [showDebug, setShowDebug] = useState(isPlaytest || params.has('debug'));

  // 자동 저장. 엔딩에 도달하면 저장을 지운다 (영구 죽음)
  useEffect(() => {
    if (!run) return;
    writeStorage(runKey, run.ending ? null : { token: playtestToken, state: run });
  }, [run, runKey, playtestToken]);

  // 테스트 플레이 중 에디터에서 내용을 고치면 바로 반영
  useEffect(() => {
    if (!isPlaytest) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEYS.playtestContent) return;
      const next = loadPlaytestContent();
      if (next) setContent(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [isPlaytest]);

  const view = run ? getView(content, run) : null;
  const compatible = !run || isStateCompatible(content, run);

  const onChoose = useCallback((id: string) => setRun((r) => (r ? choose(content, r, id) : r)), [content]);
  const onProceed = useCallback(() => setRun((r) => (r ? proceed(content, r) : r)), [content]);
  const startNew = useCallback(
    (seed?: number, startEncounterId?: string) => setRun(newRun(content, { seed, startEncounterId })),
    [content],
  );

  // 단축키: 1~9 선택지, Space/Enter 계속, ` 디버그 패널
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '`' && (isPlaytest || params.has('debug'))) {
        setShowDebug((v) => !v);
        return;
      }
      if (!view || run?.ending) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9) {
        const choice = view.choices[n - 1];
        if (choice?.enabled) onChoose(choice.id);
      } else if ((e.key === ' ' || e.key === 'Enter') && view.canProceed && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        onProceed();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, run, onChoose, onProceed, isPlaytest, params]);

  const baseSanity = content.start.maxSanity || 100;
  const sanityRatio = run ? run.sanity / baseSanity : 1;
  const mood = sanityRatio <= 0.2 ? 'mood-critical' : sanityRatio <= 0.4 ? 'mood-low' : '';

  if (!run) {
    const saved = isPlaytest ? null : readStorage<SavedRun>(runKey);
    const savedRun = saved && !saved.state.ending && isStateCompatible(content, saved.state) ? saved.state : null;
    return (
      <div className="game title-screen">
        <div className="title-card">
          <h1>{content.meta.title}</h1>
          {content.meta.subtitle && <p className="subtitle">{content.meta.subtitle}</p>}
          {content.meta.intro && <RichText className="intro" text={content.meta.intro} />}
          <div className="title-actions">
            {savedRun && (
              <button className="btn primary" onClick={() => setRun(savedRun)}>
                이어하기 <span className="muted">({savedRun.turn + 1}번째 인카운터)</span>
              </button>
            )}
            <button className={`btn ${savedRun ? '' : 'primary'}`} onClick={() => startNew()}>
              {savedRun ? '새로 시작 (저장 삭제)' : '시작'}
            </button>
          </div>
          <p className="title-note">죽으면 처음부터 다시 시작합니다. 매번 다른 일이 일어납니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`game ${mood}`}>
      <header className="topbar">
        <button className="game-title" onClick={() => setRun(null)} title="타이틀로">
          {content.meta.title}
        </button>
        <StatusBar state={run} baseSanity={baseSanity} />
        <div className="topbar-right">
          {isPlaytest && <span className="badge">테스트 플레이</span>}
          {(isPlaytest || params.has('debug')) && (
            <button className="btn small" onClick={() => setShowDebug((v) => !v)}>
              디버그 {showDebug ? '닫기' : '열기'}
            </button>
          )}
        </div>
      </header>
      <div className={`stage ${showDebug ? 'with-debug' : ''}`}>
        <main className="story">
          {!compatible ? (
            <div className="notice">
              <p>콘텐츠가 바뀌어 현재 진행 중인 인카운터를 찾을 수 없습니다.</p>
              <button className="btn primary" onClick={() => startNew()}>
                새로 시작
              </button>
            </div>
          ) : run.ending ? (
            <EndingView content={content} state={run} onRestart={() => startNew()} onTitle={() => setRun(null)} />
          ) : view ? (
            <EncounterView state={run} view={view} onChoose={onChoose} onProceed={onProceed} />
          ) : null}
        </main>
        <aside className="side">
          <Inventory content={content} state={run} />
        </aside>
        {showDebug && (
          <DebugPanel content={content} state={run} setState={setRun} onNewRun={startNew} />
        )}
      </div>
    </div>
  );
}
