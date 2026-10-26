import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { choose, getView, isStateCompatible, newRun, proceed, syncRunState } from '../engine/run';
import type { GameContent, RunState } from '../engine/types';
import { RichText } from '../markup/render';
import { loadPlaytestContent, STORAGE_KEYS } from '../shared/storage';
import { DebugPanel } from './DebugPanel';
import { EncounterView } from './EncounterView';
import { EndingView } from './EndingView';
import { Hud } from './Hud';
import { Dock, ItemList, signatures, TraitList, type SheetKind } from './Inventory';
import { MenuDrawer } from './MenuDrawer';
import { Sheet } from './Overlays';
import { ScrollArea } from './ScrollArea';
import type { RunSaver } from './saver';
import { FONT_SIZES, TYPING_SPEEDS, useSettings } from './settings';
import { resolveColors, useDocumentColors } from './theme';

/** '화면 효과'를 켠 수치(정신력 등)가 시작 최대값에 비해 낮을수록 화면이 어두워지고 흔들린다 */
function moodClass(content: GameContent, run: RunState | null): string {
  if (!run) return '';
  let ratio = 1;
  for (const p of content.params) {
    if (p.kind !== 'stat' || !p.mood || !p.max) continue;
    const s = run.stats[p.id];
    if (s) ratio = Math.min(ratio, s.value / p.max);
  }
  return ratio <= 0.2 ? 'mood-critical' : ratio <= 0.4 ? 'mood-low' : '';
}

interface Props {
  initialContent: GameContent;
  saver: RunSaver;
  /** 서버에 저장된 진행 중인 판 (타이틀의 "이어하기") */
  savedRun: RunState | null;
  /** 바로 시작할 판 (테스트 플레이) */
  initialRun: RunState | null;
  isPlaytest: boolean;
}

export function GameApp({ initialContent, saver, savedRun, initialRun, isPlaytest }: Props) {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const canDebug = isPlaytest || params.has('debug');

  const [content, setContent] = useState<GameContent>(initialContent);
  const [run, setRun] = useState<RunState | null>(initialRun);
  /** 마지막으로 저장한 진행 상태 (타이틀로 돌아갔을 때 이어하기용) */
  const [lastSaved, setLastSaved] = useState<RunState | null>(savedRun);
  // 넓은 화면에서만 디버그 패널을 처음부터 열어 둔다 (모바일에서는 메뉴에서 열기)
  const [showDebug, setShowDebug] = useState(canDebug && window.innerWidth >= 1100);
  const [settings, updateSettings] = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [seen, setSeen] = useState<Record<SheetKind, string>>({ items: '', traits: '' });

  // 자동 저장. 엔딩에 도달하면 저장을 지운다 (영구 죽음)
  useEffect(() => {
    if (!run) return;
    const state = run.ending ? null : run;
    saver.save(state);
    setLastSaved(state);
  }, [run, saver]);

  // 테스트 플레이 중 에디터에서 내용을 고치면 바로 반영
  useEffect(() => {
    if (!isPlaytest) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEYS.playtestContent) return;
      const next = loadPlaytestContent();
      if (!next) return;
      setContent(next);
      // 새로 추가된 파라미터는 시작값으로 채운다
      setRun((r) => (r ? syncRunState(next, r) : r));
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

  useDocumentColors(resolveColors(content, run, settings.theme));
  const mood = moodClass(content, run);
  const cps = TYPING_SPEEDS[settings.typing].cps;
  const style = { '--story-size': `${FONT_SIZES[settings.fontSize].px}px` } as CSSProperties;

  if (!run) {
    const resumable = lastSaved && !lastSaved.ending && isStateCompatible(content, lastSaved) ? lastSaved : null;
    return (
      <div className="title-screen" style={style}>
        <a className="title-back" href="/">
          ← 이야기 목록
        </a>
        <div className="title-card">
          <h1>{content.meta.title}</h1>
          {content.meta.subtitle && <p className="subtitle">{content.meta.subtitle}</p>}
          {content.meta.intro && <RichText className="intro" text={content.meta.intro} />}
          <div className="title-actions">
            {resumable && (
              <button className="btn primary" onClick={() => setRun(resumable)}>
                이어하기
              </button>
            )}
            <button className={`btn ${resumable ? '' : 'primary'}`} onClick={() => startNew()}>
              {resumable ? '새로 시작 (저장 삭제)' : '시작'}
            </button>
          </div>
          <p className="title-note">죽으면 처음부터 다시 시작합니다. 매번 다른 일이 일어납니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`game ${mood}`} style={style}>
      <Hud content={content} state={run} onMenu={() => setMenuOpen(true)} badge={isPlaytest ? '테스트' : undefined} />
      <main className="page">
        {!compatible ? (
          <>
            <ScrollArea className="story-scroll">
              <p className="notice">콘텐츠가 바뀌어 진행 중이던 장면을 찾을 수 없습니다.</p>
            </ScrollArea>
            <ScrollArea className="choice-scroll">
              <div className="choice-list">
                <button type="button" className="choice" onClick={() => startNew()}>
                  <span className="choice-text">새로 시작한다</span>
                </button>
              </div>
            </ScrollArea>
          </>
        ) : run.ending ? (
          <EndingView content={content} state={run} onRestart={() => startNew()} onTitle={toTitle} cps={cps} />
        ) : view ? (
          <EncounterView state={run} view={view} onChoose={onChoose} onProceed={onProceed} cps={cps} />
        ) : null}
      </main>
      <Dock content={content} state={run} seen={seen} onOpen={openSheet} />

      {content.ui.items.show && (
        <Sheet open={sheet === 'items'} title={content.ui.items.label} onClose={() => setSheet(null)}>
          <ItemList content={content} state={run} />
        </Sheet>
      )}
      {content.ui.traits.show && (
        <Sheet open={sheet === 'traits'} title={content.ui.traits.label} onClose={() => setSheet(null)}>
          <TraitList content={content} state={run} />
        </Sheet>
      )}
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
