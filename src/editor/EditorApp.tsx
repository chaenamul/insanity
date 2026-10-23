import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { joinContent, normalizeContent, splitContent } from '../engine/content';
import type { GameContent } from '../engine/types';
import { validateContent } from '../engine/validate';
import { EFFECT_TAGS } from '../markup/registry';
import { readStorage, STORAGE_KEYS, writeStorage } from '../shared/storage';
import { DefinitionsPanel, EndingsPanel, IssuesPanel, SettingsPanel } from './components/DefinitionsPanel';
import { EncounterEditor } from './components/EncounterEditor';
import { EncounterList } from './components/EncounterList';
import { FlowGraph } from './components/FlowGraph';
import { HelpPanel } from './components/HelpPanel';
import { SimulationPanel } from './components/SimulationPanel';
import { EditorProvider, useHistory, type Nav, type Tab } from './state';

interface Loaded {
  content: GameContent;
  /** 개발 서버 API로 파일에 직접 저장할 수 있는지 */
  server: boolean;
}

async function loadInitial(): Promise<Loaded> {
  try {
    const res = await fetch('/api/content');
    if (res.ok) {
      const bundle = await res.json();
      return { content: joinContent(bundle.game, bundle.encounters), server: true };
    }
  } catch {
    // 개발 서버가 아님
  }
  try {
    // 빌드 결과물에는 content-bundle.json이 함께 들어간다
    const res = await fetch('./content-bundle.json');
    if (res.ok) {
      const bundle = await res.json();
      return { content: joinContent(bundle.game, bundle.encounters), server: false };
    }
  } catch {
    // 없음
  }
  return { content: normalizeContent({}), server: false };
}

export function EditorApp() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    loadInitial().then(setLoaded);
  }, []);
  if (!loaded) return <div className="loading">불러오는 중…</div>;
  return <Editor initial={loaded.content} server={loaded.server} />;
}

const TABS: { tab: Tab; label: string }[] = [
  { tab: 'encounters', label: '인카운터' },
  { tab: 'flow', label: '흐름도' },
  { tab: 'definitions', label: '아이템·능력·플래그' },
  { tab: 'endings', label: '엔딩' },
  { tab: 'settings', label: '시작 설정' },
  { tab: 'issues', label: '검증' },
  { tab: 'simulate', label: '시뮬레이션' },
  { tab: 'help', label: '도움말' },
];

interface Draft {
  content: GameContent;
  savedAt: number;
}

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Editor({ initial, server }: { initial: GameContent; server: boolean }) {
  const { content, update, replace, undo, redo, canUndo, canRedo } = useHistory(initial);
  const [saved, setSaved] = useState(initial);
  const [saveState, setSaveState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string }>({ status: 'idle' });
  const [nav, setNav] = useState<Nav>({ tab: 'encounters', encounterId: initial.encounters[0]?.id ?? null });
  const [draftOffer, setDraftOffer] = useState<Draft | null>(() => {
    const draft = readStorage<Draft>(STORAGE_KEYS.editorDraft);
    if (!draft?.content) return null;
    const normalized = normalizeContent(draft.content);
    return JSON.stringify(normalized) === JSON.stringify(initial) ? null : { content: normalized, savedAt: draft.savedAt };
  });
  const playtestOpened = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const issues = useMemo(() => validateContent(content, { markupTags: EFFECT_TAGS }), [content]);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const dirty = content !== saved;

  const navigate = useCallback((next: Partial<Nav>) => setNav((n) => ({ ...n, ...next })), []);

  // 저장하지 않은 작업을 브라우저에 백업 (복구 제안 중에는 건드리지 않음)
  useEffect(() => {
    if (draftOffer) return;
    if (!dirty) {
      writeStorage(STORAGE_KEYS.editorDraft, null);
      return;
    }
    const t = setTimeout(() => writeStorage(STORAGE_KEYS.editorDraft, { content, savedAt: Date.now() }), 600);
    return () => clearTimeout(t);
  }, [content, dirty, draftOffer]);

  // 테스트 플레이 창이 열려 있으면 수정 사항을 바로 보냄
  useEffect(() => {
    if (!playtestOpened.current) return;
    const t = setTimeout(() => writeStorage(STORAGE_KEYS.playtestContent, content), 300);
    return () => clearTimeout(t);
  }, [content]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const playtest = useCallback(
    (startEncounterId?: string) => {
      writeStorage(STORAGE_KEYS.playtestContent, content);
      playtestOpened.current = true;
      const start = startEncounterId ? `&start=${encodeURIComponent(startEncounterId)}` : '';
      window.open(`index.html?playtest=${Date.now()}${start}`, 'insanity-playtest');
    },
    [content],
  );

  const exportFile = useCallback(() => downloadJson('insanity-content.json', splitContent(content)), [content]);

  const save = useCallback(async () => {
    if (!server) {
      exportFile();
      return;
    }
    const snapshot = content;
    setSaveState({ status: 'saving' });
    try {
      const res = await fetch('/api/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(splitContent(snapshot)),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setSaved(snapshot);
      setSaveState({ status: 'idle' });
    } catch (e) {
      setSaveState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [content, server, exportFile]);

  const importFile = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text());
      const next = raw.game ? joinContent(raw.game, raw.encounters ?? []) : normalizeContent(raw);
      if (!window.confirm(`'${file.name}'의 내용(인카운터 ${next.encounters.length}개)으로 전체를 바꿀까요? (되돌리기 가능)`)) return;
      replace(next);
      setNav({ tab: 'encounters', encounterId: next.encounters[0]?.id ?? null });
    } catch (e) {
      window.alert(`가져오기 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        save();
      } else if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, undo, redo]);

  const enc = content.encounters.find((e) => e.id === nav.encounterId) ?? null;

  const panel = (() => {
    switch (nav.tab) {
      case 'flow':
        return <FlowGraph />;
      case 'definitions':
        return <DefinitionsPanel />;
      case 'endings':
        return <EndingsPanel />;
      case 'settings':
        return <SettingsPanel />;
      case 'issues':
        return <IssuesPanel />;
      case 'simulate':
        return <SimulationPanel />;
      case 'help':
        return <HelpPanel />;
      default:
        return null;
    }
  })();

  return (
    <EditorProvider value={{ content, update, issues, nav, navigate, playtest }}>
      <div className="editor">
        <header className="editor-header">
          <div className="brand">
            {content.meta.title || 'INSANITY'} <span>에디터</span>
          </div>
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t.tab} type="button" className={nav.tab === t.tab ? 'active' : ''} onClick={() => navigate({ tab: t.tab })}>
                {t.label}
                {t.tab === 'issues' && issues.length > 0 && (
                  <span className={`count-badge ${errorCount ? 'error' : 'warning'}`}>{errorCount || issues.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <button type="button" className="icon-btn" onClick={undo} disabled={!canUndo} title="되돌리기 (Ctrl+Z)">
              ↶
            </button>
            <button type="button" className="icon-btn" onClick={redo} disabled={!canRedo} title="다시 하기 (Ctrl+Shift+Z)">
              ↷
            </button>
            <span className={`save-status ${saveState.status} ${dirty ? 'dirty' : ''}`} title={saveState.message}>
              {saveState.status === 'saving'
                ? '저장 중…'
                : saveState.status === 'error'
                  ? '저장 실패'
                  : dirty
                    ? '● 저장 안 됨'
                    : '저장됨'}
            </span>
            <button type="button" className="btn primary" onClick={save} title={server ? 'content/ 폴더에 저장 (Ctrl+S)' : 'JSON 파일로 내려받기'}>
              {server ? '저장' : '파일로 저장'}
            </button>
            <button type="button" className="btn" onClick={() => playtest()} title="처음부터 테스트 플레이 (새 탭)">
              ▶ 테스트 플레이
            </button>
            <button type="button" className="btn" onClick={exportFile} title="전체 콘텐츠를 JSON 파일 하나로 내려받기">
              내보내기
            </button>
            <button type="button" className="btn" onClick={() => fileInput.current?.click()} title="내보낸 JSON 파일 불러오기">
              가져오기
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.target.value = '';
              }}
            />
          </div>
        </header>

        {saveState.status === 'error' && (
          <div className="banner error">
            저장 실패: {saveState.message}
            <button type="button" className="link-btn" onClick={() => setSaveState({ status: 'idle' })}>
              닫기
            </button>
          </div>
        )}
        {draftOffer && (
          <div className="banner">
            저장하지 않은 작업이 브라우저에 남아 있습니다 ({new Date(draftOffer.savedAt).toLocaleString()}).
            <button
              type="button"
              className="btn small primary"
              onClick={() => {
                replace(draftOffer.content);
                setNav({ tab: 'encounters', encounterId: draftOffer.content.encounters[0]?.id ?? null });
                setDraftOffer(null);
              }}
            >
              복구
            </button>
            <button type="button" className="btn small" onClick={() => setDraftOffer(null)}>
              버리기
            </button>
          </div>
        )}
        {!server && (
          <div className="banner muted">
            개발 서버(npm run dev)가 아니라서 파일에 직접 저장할 수 없습니다. "파일로 저장"으로 내려받은 뒤 <code>npm run content -- --import 파일.json</code>
            으로 content/ 폴더에 반영하세요.
          </div>
        )}

        <div className="editor-body">
          {nav.tab === 'encounters' ? (
            <>
              <EncounterList />
              <main className="editor-main">
                {enc ? (
                  <EncounterEditor key={enc.id} enc={enc} />
                ) : (
                  <div className="empty-state">
                    <p>왼쪽에서 인카운터를 고르거나 새로 만드세요.</p>
                  </div>
                )}
              </main>
            </>
          ) : (
            <main className="editor-main full">{panel}</main>
          )}
        </div>
      </div>
    </EditorProvider>
  );
}
