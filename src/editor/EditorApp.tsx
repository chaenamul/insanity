import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { joinContent, normalizeContent, splitContent } from '../engine/content';
import type { GameContent } from '../engine/types';
import { validateContent } from '../engine/validate';
import { EFFECT_TAGS } from '../markup/registry';
import { api, ApiError, idFromPath, redirectToLogin } from '../shared/api';
import type { EditStoryInfo, EditStoryResponse } from '../shared/api-types';
import { readStorage, STORAGE_KEYS, writeStorage } from '../shared/storage';
import { DefinitionsPanel, EndingsPanel, IssuesPanel, SettingsPanel } from './components/DefinitionsPanel';
import { EncounterEditor } from './components/EncounterEditor';
import { EncounterList } from './components/EncounterList';
import { FlowGraph } from './components/FlowGraph';
import { HelpPanel } from './components/HelpPanel';
import { SimulationPanel } from './components/SimulationPanel';
import { EditorProvider, useHistory, type Nav, type Tab } from './state';

// /edit/<이야기 id> — 내 이야기의 초안을 서버에서 불러와 편집하고 저장/공개한다

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; story: EditStoryInfo; content: GameContent };

export function EditorApp() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    api<EditStoryResponse>(`/my/stories/${idFromPath()}`)
      .then((res) => {
        const content = normalizeContent(res.content);
        document.title = `${content.meta.title || '제목 없음'} — 에디터`;
        setState({ status: 'ready', story: res.story, content });
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) redirectToLogin();
        else setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
  }, []);
  if (state.status === 'loading') return <div className="loading">불러오는 중…</div>;
  if (state.status === 'error') {
    return (
      <div className="loading">
        <div>
          <p>{state.message}</p>
          <a className="btn" href="/create">
            내 이야기 목록으로
          </a>
        </div>
      </div>
    );
  }
  return <Editor story={state.story} initial={state.content} />;
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

function publishLabel(info: EditStoryInfo, dirty: boolean): string {
  if (!info.isPublished) return '공개하기';
  return info.hasUnpublishedChanges || dirty ? '수정 사항 공개' : '공개됨';
}

function Editor({ story, initial }: { story: EditStoryInfo; initial: GameContent }) {
  const { content, update, replace, undo, redo, canUndo, canRedo } = useHistory(initial);
  const [saved, setSaved] = useState(initial);
  const [info, setInfo] = useState(story);
  const [saveState, setSaveState] = useState<{ status: 'idle' | 'saving' | 'error'; message?: string; conflict?: boolean }>({ status: 'idle' });
  const [publishIssues, setPublishIssues] = useState<{ message: string; issues: string[] } | null>(null);
  const [nav, setNav] = useState<Nav>({ tab: 'encounters', encounterId: initial.encounters[0]?.id ?? null });
  const draftKey = `${STORAGE_KEYS.editorDraft}.${story.id}`;
  const [draftOffer, setDraftOffer] = useState<Draft | null>(() => {
    const draft = readStorage<Draft>(draftKey);
    if (!draft?.content) return null;
    const normalized = normalizeContent(draft.content);
    return JSON.stringify(normalized) === JSON.stringify(initial) ? null : { content: normalized, savedAt: draft.savedAt };
  });
  const playtestOpened = useRef(false);
  const saving = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const issues = useMemo(() => validateContent(content, { markupTags: EFFECT_TAGS }), [content]);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const dirty = content !== saved;

  const navigate = useCallback((next: Partial<Nav>) => setNav((n) => ({ ...n, ...next })), []);

  // 저장하지 않은 작업을 브라우저에 백업 (복구 제안 중에는 건드리지 않음)
  useEffect(() => {
    if (draftOffer) return;
    if (!dirty) {
      writeStorage(draftKey, null);
      return;
    }
    const t = setTimeout(() => writeStorage(draftKey, { content, savedAt: Date.now() }), 600);
    return () => clearTimeout(t);
  }, [content, dirty, draftOffer, draftKey]);

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
      window.open(`/play/${story.id}?playtest=${Date.now()}${start}`, 'insanity-playtest');
    },
    [content, story.id],
  );

  const exportFile = useCallback(
    () => downloadJson(`${content.meta.title || 'story'}.json`, splitContent(content)),
    [content],
  );

  /** 서버에 초안 저장. 성공하면 true */
  const save = useCallback(async (): Promise<boolean> => {
    if (saving.current) return false;
    if (!dirty) return true;
    saving.current = true;
    const snapshot = content;
    setSaveState({ status: 'saving' });
    try {
      const res = await api<{ story: EditStoryInfo }>(`/my/stories/${story.id}`, {
        method: 'PUT',
        body: { content: snapshot, version: info.version },
      });
      setInfo(res.story);
      setSaved(snapshot);
      setSaveState({ status: 'idle' });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) redirectToLogin();
      setSaveState({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
        conflict: err instanceof ApiError && err.status === 409,
      });
      return false;
    } finally {
      saving.current = false;
    }
  }, [content, dirty, info.version, story.id]);

  /** 저장한 뒤 초안을 공개본으로 */
  const publish = useCallback(async () => {
    if (!(await save())) return;
    setPublishIssues(null);
    try {
      const res = await api<{ story: EditStoryInfo }>(`/my/stories/${story.id}/publish`, { method: 'POST' });
      setInfo(res.story);
    } catch (err) {
      setPublishIssues({
        message: err instanceof Error ? err.message : String(err),
        issues: err instanceof ApiError ? (err.body.issues ?? []) : [],
      });
    }
  }, [save, story.id]);

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
          <a className="back-link" href="/create" title="내 이야기 목록">
            ←
          </a>
          <div className="brand">
            {content.meta.title || '제목 없음'} <span>에디터</span>
            <span className={`story-status ${info.isPublished ? (info.hasUnpublishedChanges ? 'warn' : 'live') : ''}`}>
              {info.isPublished ? (info.hasUnpublishedChanges ? '공개 중 · 미반영 수정' : '공개 중') : '초안'}
            </span>
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
            <button type="button" className="btn primary" onClick={save} title="서버에 초안 저장 (Ctrl+S). 플레이어에게는 공개해야 보입니다">
              저장
            </button>
            <button type="button" className="btn" onClick={() => playtest()} title="처음부터 테스트 플레이 (새 탭)">
              ▶ 테스트 플레이
            </button>
            <button
              type="button"
              className="btn publish"
              onClick={publish}
              disabled={info.isPublished && !info.hasUnpublishedChanges && !dirty}
              title="저장한 뒤 플레이어 목록에 공개합니다. 검증 오류가 있으면 공개되지 않습니다"
            >
              {publishLabel(info, dirty)}
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
            {saveState.conflict && (
              <button type="button" className="btn small" onClick={() => location.reload()} title="지금 작업은 브라우저에 백업되어 새로고침 후 복구할 수 있습니다">
                새로고침
              </button>
            )}
            <button type="button" className="link-btn" onClick={() => setSaveState({ status: 'idle' })}>
              닫기
            </button>
          </div>
        )}
        {publishIssues && (
          <div className="banner error">
            <div>
              {publishIssues.message}
              {publishIssues.issues.length > 0 && (
                <ul className="banner-list">
                  {publishIssues.issues.map((i, k) => (
                    <li key={k}>{i}</li>
                  ))}
                </ul>
              )}
            </div>
            <button type="button" className="link-btn" onClick={() => navigate({ tab: 'issues' })}>
              검증 탭 보기
            </button>
            <button type="button" className="link-btn" onClick={() => setPublishIssues(null)}>
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
