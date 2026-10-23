import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { choose, getView, isStateCompatible, newRun, proceed } from '../engine/run';
import type { GameContent, RunState } from '../engine/types';
import { RichText } from '../markup/render';
import { loadPlaytestContent, readStorage, STORAGE_KEYS, writeStorage } from '../shared/storage';
import { loadBundledContent } from './bundledContent';
import { DebugPanel } from './DebugPanel';
import { EncounterView } from './EncounterView';
import { EndingView } from './EndingView';
import { Hud } from './Hud';
import { Dock, ItemList, signatures, TraitList, type SheetKind } from './Inventory';
import { MenuDrawer } from './MenuDrawer';
import { Sheet } from './Overlays';
import { FONT_SIZES, useSettings } from './settings';

interface SavedRun {
  /** 테스트 플레이 토큰 (에디터에서 새로 열 때마다 바뀜) */
  token: string | null;
  state: RunState;
}

export function GameApp() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const playtestToken = params.get('playtest');
  const isPlaytest = playtestToken != null;
  const canDebug = isPlaytest || params.has('debug');
  const runKey = isPlaytest ? STORAGE_KEYS.playtestRun : STORAGE_KEYS.run;

  const [content, setContent] = useState<GameContent>(() => (isPlaytest && loadPlaytestContent()) || loadBundledContent());
  const [run, setRun] = useState<RunState | null>(() => {
    if (!isPlaytest) return null;
    const saved = readStorage<SavedRun>(runKey);
    if (saved && saved.token === playtestToken && isStateCompatible(content, saved.state)) return saved.state;
    return newRun(content, { startEncounterId: params.get('start') ?? undefined });
  });
  // 넓은 화면에서만 디버그 패널을 처음부터 열어 둔다 (모바일에서는 메뉴에서 열기)
  const [showDebug, setShowDebug] = useState(canDebug && window.innerWidth >= 1100);
  const [settings, updateSettings] = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [seen, setSeen] = useState<Record<SheetKind, string>>({ items: '', traits: '' });

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
    (seed?: number, startEncounterId?: string) => {
      setRun(newRun(content, { seed, startEncounterId }));
      setSeen({ items: '', traits: '' });
    },
    [content],
  );
  const openSheet = (kind: SheetKind) => {
    setSheet(kind);
    if (run) setSeen((s) => ({ ...s, [kind]: signatures(run)[kind] }));
  };
  const toTitle = () => {
    setMenuOpen(false);
    setSheet(null);
    setRun(null);
  };

  // 단축키: 1~9 선택지, Space/Enter 계속, Esc 닫기, ` 디버그 패널
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setSheet(null);
        return;
      }
      if (e.key === '`' && canDebug) {
        setShowDebug((v) => !v);
        return;
      }
      if (!view || run?.ending || menuOpen || sheet) return;
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
  }, [view, run, onChoose, onProceed, canDebug, menuOpen, sheet]);

  const baseSanity = content.start.maxSanity || 100;
  const sanityRatio = run ? run.sanity / baseSanity : 1;
  const mood = sanityRatio <= 0.2 ? 'mood-critical' : sanityRatio <= 0.4 ? 'mood-low' : '';
  const style = { '--story-size': `${FONT_SIZES[settings.fontSize].px}px` } as CSSProperties;

  if (!run) {
    const saved = isPlaytest ? null : readStorage<SavedRun>(runKey);
    const savedRun = saved && !saved.state.ending && isStateCompatible(content, saved.state) ? saved.state : null;
    return (
      <div className="title-screen" style={style}>
        <div className="title-card">
          <h1>{content.meta.title}</h1>
          {content.meta.subtitle && <p className="subtitle">{content.meta.subtitle}</p>}
          {content.meta.intro && <RichText className="intro" text={content.meta.intro} />}
          <div className="title-actions">
            {savedRun && (
              <button className="btn primary" onClick={() => setRun(savedRun)}>
                이어하기
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
    <div className={`game ${mood}`} style={style}>
      <Hud state={run} baseSanity={baseSanity} onMenu={() => setMenuOpen(true)} badge={isPlaytest ? '테스트' : undefined} />
      <main className="page">
        {!compatible ? (
          <>
            <div className="story-scroll">
              <p className="notice">콘텐츠가 바뀌어 진행 중이던 장면을 찾을 수 없습니다.</p>
            </div>
            <div className="choice-scroll">
              <div className="choice-list">
                <button type="button" className="choice" onClick={() => startNew()}>
                  <span className="choice-text">새로 시작한다</span>
                </button>
              </div>
            </div>
          </>
        ) : run.ending ? (
          <EndingView content={content} state={run} onRestart={() => startNew()} onTitle={toTitle} />
        ) : view ? (
          <EncounterView state={run} view={view} onChoose={onChoose} onProceed={onProceed} />
        ) : null}
      </main>
      <Dock state={run} seen={seen} onOpen={openSheet} />

      <Sheet open={sheet === 'items'} title="소지품" onClose={() => setSheet(null)}>
        <ItemList content={content} state={run} />
      </Sheet>
      <Sheet open={sheet === 'traits'} title="능력" onClose={() => setSheet(null)}>
        <TraitList content={content} state={run} />
      </Sheet>
      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="메뉴"
        settings={settings}
        onSettings={updateSettings}
        onTitle={toTitle}
        debug={
          canDebug
            ? {
                open: showDebug,
                toggle: () => {
                  setShowDebug((v) => !v);
                  setMenuOpen(false);
                },
              }
            : undefined
        }
      />
      {showDebug && <DebugPanel content={content} state={run} setState={setRun} onNewRun={startNew} onClose={() => setShowDebug(false)} />}
    </div>
  );
}
