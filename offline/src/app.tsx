import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  Download,
  FolderHeart,
  HardDrive,
  ImagePlus,
  Leaf,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Shirt,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  categories,
  categoryName,
  colorName,
  colorHex,
  customColor,
  colors,
  seasons,
  seasonName,
  styleName,
  styles,
} from '../../config/taxonomy';
import GarmentArt from '../../components/garment-art';
import { categoryGroups, detailedCategories, clothingName } from '../../config/clothing';
import Looks, { type LooksHandle } from './looks';
import Editor, { type EditorHandle } from './editor';
import { WardrobeStore, readableError, type GarmentDeletionPlan } from './store';
import { emptyFilters, filterGarments, toggle, type Filters } from './filter';
import { AssetImage, Loading, Modal } from './components';
import { exportParts, inspectBackup } from './backup';
import { saveBackupFile } from './platform';
import { initialSettings, type AppSettings, type LocalGarment } from './types';

type View = 'closet' | 'import' | 'looks' | 'settings' | 'trash';
const store = new WardrobeStore();
export default function App() {
  const [view, setView] = useState<View>('closet'),
    [items, setItems] = useState<LocalGarment[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [settings, setSettings] = useState<AppSettings>(initialSettings),
    [filters, setFilters] = useState<Filters>(emptyFilters),
    [filterOpen, setFilterOpen] = useState(false),
    [limit, setLimit] = useState(24);
  const [selected, setSelected] = useState<LocalGarment | null>(null),
    [editing, setEditing] = useState<LocalGarment | undefined>(),
    [editorKey, setEditorKey] = useState(0);
  const [message, setMessage] = useState(''),
    [draftExists, setDraftExists] = useState(false),
    [deleteConfirm, setDeleteConfirm] = useState(false),
    [actionBusy, setActionBusy] = useState(false);
  const [purgePlan, setPurgePlan] = useState<GarmentDeletionPlan | null>(null),
    [purgeLinked, setPurgeLinked] = useState(false),
    [actionError, setActionError] = useState('');
  const editor = useRef<EditorHandle>(null);
  const looks = useRef<LooksHandle>(null);
  const criticalBusy = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = (text: string) => {
    clearTimeout(noticeTimer.current);
    setMessage(text);
    noticeTimer.current = setTimeout(() => setMessage(''), 4500);
  };
  async function refresh() {
    const [all, prefs, draft] = await Promise.all([
      store.list(true),
      store.settings(),
      store.draft(),
    ]);
    setItems(all);
    setSettings(prefs);
    setDraftExists(Boolean(draft));
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(readableError(e)))
      .finally(() => setLoading(false));
    navigator.storage?.persist?.().catch(() => {});
    return () => clearTimeout(noticeTimer.current);
  }, []);
  useEffect(() => {
    setLimit(24);
  }, [filters, view]);
  async function go(next: View) {
    if (next === view) return;
    if (criticalBusy.current) {
      notify('备份正在处理，请完成后再切换页面');
      return;
    }
    try {
      if (view === 'import') await editor.current?.flush();
      if (view === 'looks') await looks.current?.flush();
      setSelected(null);
      setPurgePlan(null);
      setDeleteConfirm(false);
      setFilterOpen(false);
      setError('');
      if (next === 'import') {
        setEditing(undefined);
        setEditorKey((v) => v + 1);
      }
      setView(next);
      await refresh();
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(readableError(e));
    }
  }
  const back = () => {
    if (view === 'looks' && looks.current?.back()) return;
    if (deleteConfirm) {
      setDeleteConfirm(false);
      return;
    }
    if (selected) {
      setSelected(null);
      return;
    }
    if (filterOpen) {
      setFilterOpen(false);
      return;
    }
    if (view !== 'closet') void go('closet');
  };
  useEffect(() => {
    window.moriBack = () => {
      const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
      const dialog = dialogs.item(dialogs.length - 1);
      if (dialog) {
        dialog.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }));
        return true;
      }
      if (criticalBusy.current) {
        notify('备份正在处理，请稍候');
        return true;
      }
      if (deleteConfirm || selected || filterOpen || view !== 'closet') {
        back();
        return true;
      }
      return false;
    };
    return () => {
      delete window.moriBack;
    };
  }, [view, selected, filterOpen, deleteConfirm]);
  const active = items.filter((g) => !g.deletedAt),
    trashed = items.filter((g) => g.deletedAt);
  const shown = useMemo(
    () => filterGarments(items, filters, view === 'trash'),
    [items, filters, view],
  );
  const count =
    filters.categories.length +
    filters.seasons.length +
    filters.colors.length +
    filters.styles.length;
  const nav = [
    { id: 'closet' as const, label: '我的衣橱', icon: Shirt },
    { id: 'import' as const, label: '添加衣物', icon: Plus },
    { id: 'looks' as const, label: '搭配区', icon: Layers3 },
    { id: 'settings' as const, label: '收纳设置', icon: Settings2 },
  ];
  const theme = filters.seasons.length === 1 ? filters.seasons[0] : 'winter';
  const change = (key: keyof Filters, value: unknown) =>
    setFilters((f) => ({ ...f, [key]: value }));
  async function trash(item: LocalGarment, toTrash: boolean) {
    setActionError('');
    setActionBusy(true);
    try {
      await store.changeTrash(item.id, toTrash);
      setSelected(null);
      setDeleteConfirm(false);
      await refresh();
      notify(toTrash ? '已移入回收站，可随时恢复' : '已放回衣橱');
    } catch (e) {
      setActionError(readableError(e));
    } finally {
      setActionBusy(false);
    }
  }
  async function confirmPurge(item: LocalGarment) {
    setActionBusy(true);
    setActionError('');
    setPurgeLinked(false);
    try {
      setPurgePlan(await store.garmentDeletionPlan(item.id));
    } catch (e) {
      setActionError(readableError(e));
    } finally {
      setActionBusy(false);
    }
  }
  async function purge() {
    if (!purgePlan || actionBusy) return;
    setActionBusy(true);
    setActionError('');
    try {
      await store.purgeGarment(purgePlan, purgeLinked);
      setPurgePlan(null);
      setSelected(null);
      await refresh();
      notify('已永久删除衣物及其本机照片');
    } catch (e) {
      setActionError(readableError(e));
    } finally {
      setActionBusy(false);
    }
  }
  return (
    <div className={`offline-app theme-${theme}`}>
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <button className="brand" onClick={() => go('closet')}>
          <span className="brand-mark">
            <Shirt size={24} strokeWidth={1.4} />
          </span>
          <span>
            沐衣<small>MŌRI WARDROBE</small>
          </span>
        </button>
        <p className="sidebar-label">A LITTLE SPACE FOR YOUR STYLE.</p>
        <nav aria-label="主导航">
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? 'active' : ''}`}
              aria-current={view === n.id ? 'page' : undefined}
              onClick={() => go(n.id)}
            >
              <n.icon size={19} />
              {n.label}
              {view === n.id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Leaf size={30} strokeWidth={1.2} />
          <p>
            把每一件喜欢，
            <br />
            好好收起来。
          </p>
          <span>LESS SEARCHING. MORE LOVING.</span>
        </div>
        <div className="sidebar-storage">
          <LockKeyhole size={17} />
          <div>
            你的私人衣橱<small>照片与资料只保存在本机</small>
          </div>
        </div>
      </aside>
      <div className="app-frame">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => go('closet')}>
            <Shirt size={22} strokeWidth={1.5} />
            沐衣<span>MŌRI</span>
          </button>
          <span className="breadcrumb">
            我的空间<span>/</span>
            {view === 'trash' ? '回收站' : nav.find((n) => n.id === view)?.label}
          </span>
          <span className="local-badge">
            <span />
            本机存储
            <ShieldCheck size={13} />
          </span>
        </header>
        <main id="main" className="main-content">
          {error && (
            <div className="error-banner" role="alert">
              <p>{error}</p>
              <button
                onClick={() => {
                  setError('');
                  refresh().catch((e) => setError(readableError(e)));
                }}
              >
                重试
              </button>
            </div>
          )}
          {loading ? (
            <Loading />
          ) : view === 'import' ? (
            <Editor
              key={editorKey}
              ref={editor}
              store={store}
              editing={editing}
              autoProcess={settings.autoProcess}
              notify={notify}
              onSaved={() => {
                setView('closet');
                setEditing(undefined);
                refresh().catch((e) => setError(readableError(e)));
                window.scrollTo({ top: 0 });
              }}
            />
          ) : view === 'looks' ? (
            <Looks
              ref={looks}
              store={store}
              items={items}
              notify={notify}
              onAddGarment={() => void go('import')}
            />
          ) : view === 'settings' ? (
            <Settings
              store={store}
              settings={settings}
              onSettings={async (next) => {
                await store.saveSettings(next);
                setSettings(next);
              }}
              count={active.length}
              trashCount={trashed.length}
              openTrash={() => {
                setFilters(emptyFilters);
                go('trash');
              }}
              onRefresh={refresh}
              busyGuard={criticalBusy}
              notify={notify}
            />
          ) : (
            <>
              <div className="page-title title-with-action">
                <div>
                  <p className="eyebrow">
                    {view === 'trash'
                      ? 'A LITTLE ROOM TO CHANGE YOUR MIND'
                      : 'EVERY PIECE HAS ITS PLACE'}
                  </p>
                  <h1>
                    {view === 'trash' ? '暂时收起的喜欢' : '我的衣橱'}
                    <span>.</span>
                  </h1>
                  <p>
                    {view === 'trash'
                      ? '可以放回衣橱，也可以确认后永久删除。'
                      : '喜欢的都在这里，慢慢整理自己的日常。'}
                  </p>
                </div>
                {view === 'trash' ? (
                  <button
                    className="button secondary"
                    onClick={() => {
                      setFilters(emptyFilters);
                      go('closet');
                    }}
                  >
                    <ArrowLeft size={17} />
                    返回衣橱
                  </button>
                ) : (
                  <button className="button primary desktop-add" onClick={() => go('import')}>
                    <Plus size={17} />
                    添加衣物
                  </button>
                )}
              </div>
              {view === 'closet' && (
                <>
                  <div className="closet-banner">
                    <div>
                      <span className="tiny-label">YOUR WARDROBE, AT EASE</span>
                      <h2>
                        喜欢的每一件，
                        <br />
                        都有自己的位置。
                      </h2>
                      <p>
                        <b>{active.length}</b> 件心爱单品，收进日常的小小秩序。
                      </p>
                    </div>
                    <div className="banner-art" aria-hidden="true">
                      <div className="art-card knit">
                        <GarmentArt kind="sweater" color="#ccbfae" />
                      </div>
                      <div className="art-card trousers">
                        <GarmentArt kind="trousers" color="#a7b0a3" />
                      </div>
                      <span>
                        only things
                        <br />
                        you love.
                      </span>
                    </div>
                  </div>
                  <div className="season-summary">
                    <button
                      className={!filters.seasons.length ? 'active' : ''}
                      onClick={() => change('seasons', [])}
                    >
                      全部衣物<strong>{active.length}</strong>
                    </button>
                    <span />
                    <button
                      className={filters.seasons.includes('winter') ? 'active' : ''}
                      onClick={() =>
                        change(
                          'seasons',
                          filters.seasons.length === 1 && filters.seasons[0] === 'winter'
                            ? []
                            : ['winter'],
                        )
                      }
                    >
                      暖冬衣橱
                      <strong>{active.filter((g) => g.seasons.includes('winter')).length}</strong>
                    </button>
                    <span />
                    <button
                      className={filters.seasons.includes('spring-autumn') ? 'active' : ''}
                      onClick={() =>
                        change(
                          'seasons',
                          filters.seasons.length === 1 && filters.seasons[0] === 'spring-autumn'
                            ? []
                            : ['spring-autumn'],
                        )
                      }
                    >
                      春秋衣橱
                      <strong>
                        {active.filter((g) => g.seasons.includes('spring-autumn')).length}
                      </strong>
                    </button>
                    <span />
                    <button
                      className={filters.seasons.includes('summer') ? 'active' : ''}
                      onClick={() =>
                        change(
                          'seasons',
                          filters.seasons.length === 1 && filters.seasons[0] === 'summer'
                            ? []
                            : ['summer'],
                        )
                      }
                    >
                      清夏衣橱
                      <strong>{active.filter((g) => g.seasons.includes('summer')).length}</strong>
                    </button>
                    <small>
                      <HardDrive size={13} />
                      离线也能翻看的喜欢
                    </small>
                  </div>
                  {draftExists && (
                    <button className="draft-continue" onClick={() => go('import')}>
                      <SaveIcon />
                      <span>还有一件衣物，等你继续整理</span>
                      <ChevronRight size={17} />
                    </button>
                  )}
                </>
              )}
              <div className="closet-toolbar">
                <label className="search-field">
                  <Search size={18} />
                  <input
                    aria-label="搜索衣物"
                    placeholder="搜索名称、色系、风格…"
                    value={filters.q}
                    onChange={(e) => change('q', e.target.value)}
                  />
                  {filters.q && (
                    <button aria-label="清空搜索" onClick={() => change('q', '')}>
                      <X size={16} />
                    </button>
                  )}
                </label>
                <button
                  className={`button secondary filter-button ${count ? 'filtered' : ''}`}
                  onClick={() => setFilterOpen(true)}
                >
                  <SlidersHorizontal size={17} />
                  筛选{count > 0 && <span>{count}</span>}
                </button>
                <select
                  className="sort-select"
                  aria-label="排列顺序"
                  value={filters.sort}
                  onChange={(e) => change('sort', e.target.value)}
                >
                  <option value="newest">最近添加</option>
                  <option value="oldest">最早添加</option>
                  <option value="name">按名称</option>
                </select>
              </div>
              <div className="category-tabs" aria-label="按品类筛选">
                <button
                  className={!filters.categories.length ? 'active' : ''}
                  onClick={() => change('categories', [])}
                >
                  全部单品
                </button>
                {categoryGroups.map((c) => (
                  <button
                    key={c.id}
                    className={filters.categories.includes(`group:${c.id}`) ? 'active' : ''}
                    aria-pressed={filters.categories.includes(`group:${c.id}`)}
                    onClick={() =>
                      change('categories', toggle(filters.categories, `group:${c.id}`))
                    }
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              {(count > 0 || filters.q) && (
                <div className="filter-summary">
                  <span>找到 {shown.length} 件</span>
                  <button onClick={() => setFilters(emptyFilters)}>
                    清空条件
                    <X size={12} />
                  </button>
                </div>
              )}
              {!shown.length ? (
                <div className="empty-state">
                  <div className="empty-art">
                    <Shirt size={49} strokeWidth={1} />
                    <Leaf size={20} />
                  </div>
                  <h2>
                    {(view === 'trash' ? trashed : active).length
                      ? '暂时没找到这样的单品'
                      : view === 'trash'
                        ? '回收站空空的'
                        : '这里，留给你的第一件喜欢'}
                  </h2>
                  <p>
                    {(view === 'trash' ? trashed : active).length
                      ? '换个关键词，或放宽一点筛选条件。'
                      : view === 'trash'
                        ? '移除的衣物会留在这里，想穿时还能恢复。'
                        : '拍一张照片，或从相册中选一件，开始整理。'}
                  </p>
                  {(view === 'trash' ? trashed : active).length ? (
                    <button className="button secondary" onClick={() => setFilters(emptyFilters)}>
                      清空筛选
                    </button>
                  ) : (
                    view === 'closet' && (
                      <button className="button primary" onClick={() => go('import')}>
                        <Plus size={17} />
                        添加第一件衣物
                      </button>
                    )
                  )}
                  <small>每一件，都值得被好好喜欢。</small>
                </div>
              ) : (
                <>
                  <div className="garment-grid">
                    {shown.slice(0, limit).map((item) => (
                      <button
                        className="garment-card"
                        key={item.id}
                        aria-label={`查看${item.name}`}
                        onClick={() => {
                          setActionError('');
                          setSelected(item);
                        }}
                      >
                        <span
                          className="garment-photo"
                          style={{ background: item.recipe.background }}
                        >
                          <AssetImage store={store} item={item} />
                          <span className="card-season">
                            {item.seasons.length > 1
                              ? '跨季'
                              : seasonName(item.seasons[0]).replace('季', '')}
                          </span>
                          <span className="card-open">
                            <ArrowRight size={15} />
                          </span>
                        </span>
                        <span className="garment-info">
                          <strong>{item.name}</strong>
                          <span>
                            <span>{clothingName(item)}</span>
                            <span className="card-color">
                              <i
                                style={{
                                  background: colorHex(item.colors[0]),
                                }}
                              />
                              {colorName(item.colors[0])}
                            </span>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {shown.length > limit && (
                    <button
                      className="button secondary load-more"
                      onClick={() => setLimit((v) => v + 24)}
                    >
                      再看 {Math.min(24, shown.length - limit)} 件<span>共 {shown.length} 件</span>
                    </button>
                  )}
                </>
              )}
            </>
          )}
          <footer>沐衣 MŌRI · 把喜欢，好好收藏</footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="手机导航">
        {nav.map((n) => (
          <button
            key={n.id}
            className={view === n.id ? 'active' : ''}
            aria-current={view === n.id ? 'page' : undefined}
            onClick={() => go(n.id)}
          >
            <span className={n.id === 'import' ? 'add-icon' : ''}>
              <n.icon size={22} />
            </span>
            {n.label}
          </button>
        ))}
      </nav>
      {message && (
        <div className="toast" role="status">
          <Check size={17} />
          {message}
        </div>
      )}
      {filterOpen && (
        <Modal title="找到想穿的那一件" onClose={() => setFilterOpen(false)}>
          <p className="muted">同组可多选，不同组一起筛选。</p>
          {categoryGroups.map((group) => (
            <fieldset className="tag-group" key={group.id}>
              <legend>{group.name}</legend>
              <div className="chips">
                {[
                  { id: `group:${group.id}`, name: `全部${group.name}` },
                  ...detailedCategories
                    .filter((d) => d.group === group.id)
                    .map((d) => ({ id: `detail:${d.id}`, name: d.name })),
                ].map((option) => (
                  <button
                    key={option.id}
                    className={`chip ${filters.categories.includes(option.id) ? 'selected' : ''}`}
                    aria-pressed={filters.categories.includes(option.id)}
                    onClick={() => change('categories', toggle(filters.categories, option.id))}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          {[
            { key: 'seasons', label: '适用季节', options: seasons },
            {
              key: 'colors',
              label: '色系',
              options: [
                ...colors,
                ...[...new Set(items.flatMap((g) => g.colors).filter(customColor))].map((id) => ({
                  id,
                  name: colorName(id),
                  hex: colorHex(id),
                })),
              ],
            },
            { key: 'styles', label: '风格', options: styles },
          ].map((group) => (
            <fieldset className="tag-group" key={group.key}>
              <legend>{group.label}</legend>
              <div className="chips">
                {group.options.map((option) => (
                  <button
                    key={option.id}
                    className={`chip ${filters[group.key as 'seasons'].includes(option.id) ? 'selected' : ''}`}
                    aria-pressed={filters[group.key as 'seasons'].includes(option.id)}
                    onClick={() =>
                      change(
                        group.key as keyof Filters,
                        toggle(filters[group.key as 'seasons'], option.id),
                      )
                    }
                  >
                    {'hex' in option && (
                      <i className="color-dot" style={{ background: option.hex as string }} />
                    )}
                    {option.name}
                    {filters[group.key as 'seasons'].includes(option.id) && <Check size={12} />}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setFilters(emptyFilters)}>
              重置
            </button>
            <button className="button primary" onClick={() => setFilterOpen(false)}>
              查看 {shown.length} 件<ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
      {selected && (
        <Modal title="衣橱里的这一件" onClose={() => !actionBusy && setSelected(null)} wide>
          <div className="detail-layout">
            <div className="detail-photo" style={{ background: selected.recipe.background }}>
              <AssetImage store={store} item={selected} kind="image" />
            </div>
            <div className="detail-copy">
              <span className="eyebrow">ONE OF YOUR FAVORITES</span>
              <h2>{selected.name}</h2>
              <div className="chips">
                <span className="chip selected">{clothingName(selected)}</span>
                {selected.seasons.map((s) => (
                  <span className="chip" key={s}>
                    {seasonName(s)}
                  </span>
                ))}
              </div>
              <h3>它的颜色</h3>
              <div className="chips">
                {selected.colors.map((id) => (
                  <span key={id} className="chip">
                    <i className="color-dot" style={{ background: colorHex(id) }} />
                    {colorName(id)}
                  </span>
                ))}
              </div>
              <h3>风格关键词</h3>
              <div className="chips">
                {selected.styles.length ? (
                  selected.styles.map((id) => (
                    <span key={id} className="chip">
                      {styleName(id)}
                    </span>
                  ))
                ) : (
                  <span className="muted">还没有风格标签</span>
                )}
              </div>
              <h3>关于它</h3>
              <p className="detail-notes">{selected.notes || '暂时没有备注，喜欢本身就是理由。'}</p>
              <small>加入衣橱 · {new Date(selected.createdAt).toLocaleDateString('zh-CN')}</small>
              {actionError && (
                <p className="error-banner" role="alert">
                  {actionError}
                </p>
              )}
              <div className="detail-actions">
                {selected.deletedAt ? (
                  <>
                    <button
                      className="button primary"
                      disabled={actionBusy}
                      onClick={() => trash(selected, false)}
                    >
                      <RotateCcw size={17} />
                      放回衣橱
                    </button>
                    <button
                      className="button secondary danger-text"
                      disabled={actionBusy}
                      onClick={() => confirmPurge(selected)}
                    >
                      {actionBusy ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <Trash2 size={16} />
                      )}
                      永久删除
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="button primary"
                      onClick={async () => {
                        try {
                          const draft = await store.draft();
                          const hasOtherDraft = draft && draft.editingId !== selected.id;
                          setEditing(hasOtherDraft ? undefined : selected);
                          setEditorKey((v) => v + 1);
                          setSelected(null);
                          setView('import');
                          if (hasOtherDraft) notify('请先继续整理或丢弃上次草稿，再编辑这件衣物');
                          window.scrollTo({ top: 0 });
                        } catch (e) {
                          notify(readableError(e));
                        }
                      }}
                    >
                      <Settings2 size={16} />
                      编辑这件衣物
                    </button>
                    <button
                      className="button secondary danger-text"
                      onClick={() => {
                        setActionError('');
                        setDeleteConfirm(true);
                      }}
                    >
                      <Trash2 size={16} />
                      移入回收站
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
      {deleteConfirm && selected && (
        <Modal title="先把这件衣物收起来？" onClose={() => !actionBusy && setDeleteConfirm(false)}>
          <p>“{selected.name}”会移入回收站，照片和标签仍会保留，可以随时恢复。</p>
          {actionError && (
            <p className="error-banner" role="alert">
              {actionError}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={actionBusy}
              onClick={() => setDeleteConfirm(false)}
            >
              继续留在衣橱
            </button>
            <button
              className="button danger"
              disabled={actionBusy}
              onClick={() => trash(selected, true)}
            >
              {actionBusy ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
              移入回收站
            </button>
          </div>
        </Modal>
      )}
      {purgePlan && selected && (
        <Modal title="永久删除这件衣物？" onClose={() => !actionBusy && setPurgePlan(null)}>
          <p>
            将永久删除“{selected.name}
            ”的照片、抠图、缩略图、蒙版和标签，以及它的编辑草稿。此操作无法撤销。
          </p>
          <p className="notice">
            手机相册里的原照片、已经导出的备份不会被删除。仅移入回收站不会释放这些照片占用的空间。
          </p>
          {(purgePlan.looks.length > 0 || purgePlan.lookDraft) && (
            <div className="notice">
              <strong>这件衣物仍有关联搭配</strong>
              {purgePlan.looks.length > 0 && (
                <p>
                  涉及 {purgePlan.looks.length} 套搭配（含已收起）：
                  {purgePlan.looks.map((l) => l.name).join('、')}。
                </p>
              )}
              {purgePlan.lookDraft && <p>还涉及一份未保存的搭配草稿。</p>}
              <p>
                可以取消后去搭配区调整关联；若一起删除，以上搭配会整套删除，其中的其他衣物仍会保留。
              </p>
              <label className="purge-consent">
                <input
                  type="checkbox"
                  checked={purgeLinked}
                  disabled={actionBusy}
                  onChange={(e) => setPurgeLinked(e.target.checked)}
                />
                我确认同时永久删除以上关联搭配和相关搭配草稿
              </label>
            </div>
          )}
          {actionError && (
            <p className="error-banner" role="alert">
              {actionError}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={actionBusy}
              onClick={() => setPurgePlan(null)}
            >
              取消
            </button>
            <button
              className="button danger"
              disabled={
                actionBusy ||
                Boolean((purgePlan.looks.length || purgePlan.lookDraft) && !purgeLinked)
              }
              onClick={purge}
            >
              {actionBusy ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
              {actionBusy ? '正在永久删除…' : '确认永久删除'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function SaveIcon() {
  return <Archive size={17} />;
}
function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function Settings({
  store,
  settings,
  onSettings,
  count,
  trashCount,
  openTrash,
  onRefresh,
  busyGuard,
  notify,
}: {
  store: WardrobeStore;
  settings: AppSettings;
  onSettings: (settings: AppSettings) => Promise<void>;
  count: number;
  trashCount: number;
  openTrash: () => void;
  onRefresh: () => Promise<void>;
  busyGuard: { current: boolean };
  notify: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [error, setError] = useState(''),
    [backup, setBackup] = useState<Awaited<ReturnType<typeof inspectBackup>> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [usage, setUsage] = useState<Awaited<ReturnType<WardrobeStore['storageUsage']>> | null>(
      null,
    ),
    [usageError, setUsageError] = useState('');
  useEffect(() => {
    let active = true;
    setUsage(null);
    setUsageError('');
    store
      .storageUsage()
      .then((value) => active && setUsage(value))
      .catch((e) => active && setUsageError(readableError(e)));
    return () => {
      active = false;
    };
  }, [store, count, trashCount, busy]);
  useEffect(() => {
    busyGuard.current = busy;
    return () => {
      busyGuard.current = false;
    };
  }, [busy, busyGuard]);
  async function exporting() {
    setBusy(true);
    setError('');
    let completed = 0;
    try {
      for await (const part of exportParts(store, setProgress)) {
        setProgress(`请选择第 ${part.part}/${part.parts} 卷的保存位置`);
        await saveBackupFile(part.blob, part.name);
        completed++;
      }
      await onSettings({ ...settings, lastBackup: new Date().toISOString() });
      notify('备份已导出，请妥善保存全部分卷');
    } catch (e) {
      setError(
        `${completed ? `已导出 ${completed} 卷，本次完整备份尚未完成。` : ''}${readableError(e)}`,
      );
    } finally {
      setBusy(false);
      setProgress('');
    }
  }
  async function inspect(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    setProgress('正在检查备份内容与图片完整性…');
    try {
      setBackup(await inspectBackup(file));
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
      setProgress('');
      if (input.current) input.current.value = '';
    }
  }
  async function restore() {
    if (!backup) return;
    setBusy(true);
    setError('');
    setProgress('正在恢复到本机衣橱…');
    try {
      const result = await store.restore(backup.entries, backup.backupId, backup.looks);
      setBackup(null);
      await onRefresh();
      notify(
        `已恢复 ${result.restored} 件衣物，跳过 ${result.skipped} 件；已处理 ${backup.looks.length} 套搭配`,
      );
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }
  return (
    <div className="settings-page">
      <div className="page-title">
        <p className="eyebrow">KEEP YOUR LITTLE WORLD IN ORDER</p>
        <h1>
          收纳设置<span>.</span>
        </h1>
        <p>好好收起照片，也好好留一份备份。</p>
      </div>
      <div className="privacy-card">
        <span className="privacy-icon">
          <ShieldCheck size={28} strokeWidth={1.3} />
        </span>
        <div>
          <h2>只在这台设备，只属于你</h2>
          <p>照片、标签和编辑记录保存在本机，衣橱整理无需联网。</p>
        </div>
        <span className="privacy-count">
          {count}
          <small>件单品</small>
        </span>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {busy && <Loading text={progress || '正在保存…'} />}
      <section className="settings-card">
        <h2>本机图片占用</h2>
        <p className="storage-size" role="status">
          {usage ? formatBytes(usage.total) : usageError ? '暂时无法统计' : '正在统计…'}
        </p>
        {usageError && (
          <p role="alert" className="error-banner">
            {usageError}
          </p>
        )}
        <p className="muted">
          包含衣物照片、处理图片、缩略图、蒙版、搭配预览和图片草稿，也包含回收站。此处按图片文件大小统计，不包含应用、内置模型和数据库额外占用。
        </p>
        <p className="notice">
          照片保存在本应用的私有空间，会占用手机存储容量。永久删除后系统会回收或复用空间，设置中显示的占用可能不会立即减少。
        </p>
      </section>
      <section className="settings-card">
        <h2>整理习惯</h2>
        <div className="setting-row">
          <div>
            <strong>导入后自动整理</strong>
            <p>使用内置模型尝试抠图与分类，结果可以修改。</p>
          </div>
          <button
            className={`switch ${settings.autoProcess ? 'on' : ''}`}
            role="switch"
            aria-checked={settings.autoProcess}
            aria-label="导入后自动整理"
            disabled={busy}
            onClick={async () => {
              try {
                await onSettings({ ...settings, autoProcess: !settings.autoProcess });
                notify(settings.autoProcess ? '已关闭自动整理' : '已开启自动整理');
              } catch (e) {
                setError(readableError(e));
              }
            }}
          >
            <span />
          </button>
        </div>
      </section>
      <section className="settings-card">
        <h2>数据与备份</h2>
        <p className="muted">
          备份包含原图、处理结果、自定义颜色、标签、搭配和回收站。超过48MB自动分卷，请保存全部分卷并按顺序恢复。
        </p>
        <div className="backup-actions">
          <button className="button primary" disabled={busy} onClick={exporting}>
            <Download size={18} />
            导出完整备份
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={18} />
            从备份恢复
          </button>
        </div>
        <small className="backup-date">
          {settings.lastBackup
            ? `上次导出：${new Date(settings.lastBackup).toLocaleString('zh-CN')}`
            : '还没有导出过备份，建议整理后留一份。'}
        </small>
        <p className="notice">
          恢复会追加衣物，已有的较新编辑不会被覆盖。也支持导入原网页版的沐衣备份；多卷备份需逐卷恢复。
        </p>
        <input
          ref={input}
          hidden
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          onChange={(e) => inspect(e.target.files?.[0])}
        />
      </section>
      <section className="settings-card">
        <h2>收起的衣物</h2>
        <button className="setting-row row-button" disabled={busy} onClick={openTrash}>
          <span className="row-icon">
            <Trash2 size={20} />
          </span>
          <div>
            <strong>回收站</strong>
            <p>{trashCount} 件衣物，可恢复，也可确认后永久删除。</p>
          </div>
          <ChevronRight size={18} />
        </button>
      </section>
      <div className="storage-warning">
        <LockKeyhole size={19} />
        <p>卸载应用或清除应用数据会移除本机衣橱。请把备份另存到“文件”或其他安全位置。</p>
      </div>
      <p className="version-label">Yu's Mori · 离线衣橱 0.2.1</p>
      {backup && (
        <Modal title="恢复这份衣橱备份？" onClose={() => !busy && setBackup(null)}>
          <div className="restore-summary">
            <Archive size={28} />
            <strong>
              {backup.entries.length} 件衣物 · {backup.looks.length} 套搭配
            </strong>
            <p>{new Date(backup.exportedAt).toLocaleString('zh-CN')}</p>
            <span>
              第 {backup.part}/{backup.parts} 卷{backup.legacy ? ' · 来自原网页版' : ''}
            </span>
          </div>
          <p className="notice">
            图片完整性已检查。回收站状态会保留，重复导入同一卷会跳过已恢复的衣物。
          </p>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button className="button secondary" disabled={busy} onClick={() => setBackup(null)}>
              取消
            </button>
            <button className="button primary" disabled={busy} onClick={restore}>
              {busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}恢复到本机
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
