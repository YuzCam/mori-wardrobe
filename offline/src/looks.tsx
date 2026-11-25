import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ArrowLeft, Check, Layers3, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { categoryGroups, clothingGroup, clothingName } from '../../config/clothing';
import { backgrounds } from '../../config/taxonomy';
import { AssetImage, Loading, Modal } from './components';
import { emptyFilters, filterGarments } from './filter';
import { readableError, type WardrobeStore } from './store';
import type { LocalGarment } from './types';
import { lookSchema, type LocalLook, type LookInput } from './looks-model';
import { blobOf } from '../../features/image-editor/engine';
import { garmentCutout, renderLook } from './look-images';
export type LooksHandle = { flush: () => Promise<void>; back: () => boolean };
const blank = (): LookInput => ({ name: '', notes: '', background: '#f2eee8', layers: [] });
function LookImage({ store, look }: { store: WardrobeStore; look: LocalLook }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true,
      value = '';
    store
      .lookPreview(look.id)
      .then((blob) => {
        if (blob && active) {
          value = URL.createObjectURL(blob);
          setUrl(value);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      if (value) URL.revokeObjectURL(value);
    };
  }, [store, look.id, look.revision]);
  return url ? (
    <img src={url} alt={look.name} loading="lazy" />
  ) : (
    <span className="image-placeholder">正在读取搭配预览…</span>
  );
}
function Cutout({ store, item }: { store: WardrobeStore; item: LocalGarment }) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true,
      value = '';
    setError(false);
    garmentCutout(store, item)
      .then((c) => blobOf(c))
      .then((blob) => {
        if (active) {
          value = URL.createObjectURL(blob);
          setUrl(value);
        }
      })
      .catch(() => active && setError(true));
    return () => {
      active = false;
      if (value) URL.revokeObjectURL(value);
    };
  }, [store, item.id, item.revision]);
  return url ? (
    <img src={url} alt={item.name} draggable={false} />
  ) : (
    <span className="image-placeholder">{error ? '图片未能读取' : '读取中…'}</span>
  );
}
export default forwardRef<
  LooksHandle,
  {
    store: WardrobeStore;
    items: LocalGarment[];
    notify: (s: string) => void;
    onAddGarment: () => void;
  }
>(function Looks({ store, items, notify, onAddGarment }, ref) {
  const [looks, setLooks] = useState<LocalLook[]>([]),
    [loading, setLoading] = useState(true),
    [editing, setEditing] = useState(false),
    [record, setRecord] = useState<LocalLook | undefined>(),
    [input, setInput] = useState<LookInput>(blank);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [picker, setPicker] = useState(false),
    [group, setGroup] = useState(''),
    [q, setQ] = useState(''),
    [active, setActive] = useState(''),
    [trash, setTrash] = useState(false),
    [remove, setRemove] = useState<LocalLook | null>(null),
    [draft, setDraft] = useState<Awaited<ReturnType<typeof store.lookDraft>>>();
  const saved = useRef(false),
    queue = useRef(Promise.resolve());
  const board = useRef<HTMLDivElement>(null),
    drag = useRef<{ id: string; px: number; py: number; x: number; y: number } | null>(null);
  const latest = useRef({ input, editing, record, saving });
  latest.current = { input, editing, record, saving };
  async function refresh() {
    setLooks(await store.listLooks(true));
    setDraft(await store.lookDraft());
  }
  async function flush() {
    if (latest.current.saving) throw new Error('搭配正在保存，请稍候');
    const state = latest.current;
    if (!state.editing || saved.current || (!state.input.name && !state.input.layers.length))
      return;
    const data = structuredClone(state.input),
      meta = state.record ? { id: state.record.id, revision: state.record.revision } : undefined;
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (!saved.current)
          await store.saveLookDraft({
            id: 'current',
            input: data,
            editing: meta,
            savedAt: new Date().toISOString(),
          });
      });
    await queue.current;
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(readableError(e)))
      .finally(() => setLoading(false));
  }, [store]);
  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(() => {
      flush().catch((e) => setError(readableError(e)));
    }, 600);
    return () => clearTimeout(timer);
  }, [input, editing]);
  useImperativeHandle(ref, () => ({
    flush,
    back: () => {
      if (saving) return true;
      if (picker) {
        setPicker(false);
        return true;
      }
      if (remove) {
        setRemove(null);
        return true;
      }
      if (editing) {
        flush()
          .then(() => {
            setEditing(false);
            void refresh();
          })
          .catch((e) => setError(readableError(e)));
        return true;
      }
      if (trash) {
        setTrash(false);
        return true;
      }
      return false;
    },
  }));
  function begin(look?: LocalLook) {
    if (draft && look && draft.editing?.id !== look.id) {
      setError('请先继续或清除未保存的搭配草稿，再编辑另一套搭配');
      return;
    }
    if (draft && (!look || draft.editing?.id === look.id)) {
      saved.current = false;
      setRecord(draft.editing ? looks.find((l) => l.id === draft.editing!.id) : undefined);
      setInput(structuredClone(draft.input));
    } else {
      saved.current = false;
      setRecord(look);
      setInput(
        look
          ? {
              name: look.name,
              notes: look.notes,
              background: look.background,
              layers: structuredClone(look.layers),
            }
          : blank(),
      );
    }
    setActive('');
    setError('');
    setEditing(true);
    window.scrollTo({ top: 0 });
  }
  function updateLayer(id: string, change: Partial<LookInput['layers'][number]>) {
    setInput((v) => ({
      ...v,
      layers: v.layers.map((l) => (l.garmentId === id ? { ...l, ...change } : l)),
    }));
  }
  function add(item: LocalGarment) {
    if (input.layers.some((l) => l.garmentId === item.id)) {
      setInput((v) => ({ ...v, layers: v.layers.filter((l) => l.garmentId !== item.id) }));
      return;
    }
    if (input.layers.length >= 12) return;
    const g = clothingGroup(item),
      position =
        g === 'bottoms'
          ? { x: 35, y: 43, width: 34 }
          : g === 'footwear'
            ? { x: 34, y: 79, width: 32 }
            : g === 'accessories'
              ? {
                  x: 70,
                  y:
                    14 +
                    input.layers.filter((l) => {
                      const garment = items.find((i) => i.id === l.garmentId);
                      return garment && clothingGroup(garment) === 'accessories';
                    }).length *
                      18,
                  width: 24,
                }
              : { x: 25, y: 6, width: 48 };
    setInput((v) => ({
      ...v,
      layers: [
        ...v.layers,
        { garmentId: item.id, ...position, y: Math.min(90, position.y), rotation: 0 },
      ],
    }));
    setActive(item.id);
  }
  async function save() {
    setError('');
    setSaving(true);
    try {
      const data = lookSchema.parse(input);
      const preview = await renderLook(store, items, data);
      await queue.current.catch(() => {});
      saved.current = true;
      try {
        await store.saveLook(
          data,
          preview,
          record ? { id: record.id, revision: record.revision } : undefined,
        );
      } catch (e) {
        saved.current = false;
        throw e;
      }
      setEditing(false);
      await refresh();
      notify('搭配已保存在本机');
    } catch (e) {
      setError(readableError(e));
    } finally {
      setSaving(false);
    }
  }
  const chosen = items.find((g) => g.id === active),
    layer = input.layers.find((l) => l.garmentId === active);
  const shown = filterGarments(items, {
    ...emptyFilters,
    q,
    categories: group ? [`group:${group}`] : [],
  });
  return (
    <section className="looks-page">
      <div className="page-title">
        <p className="eyebrow">YOUR PIECES, YOUR WAY</p>
        <h1>
          搭配区<span>.</span>
        </h1>
        <p>把已有衣物放在一起，搭出喜欢的样子。</p>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {loading ? (
        <Loading />
      ) : editing ? (
        <>
          <div className="look-top-actions">
            <button
              className="button secondary"
              disabled={saving}
              onClick={() => {
                flush()
                  .then(() => {
                    setEditing(false);
                    void refresh();
                  })
                  .catch((e) => setError(readableError(e)));
              }}
            >
              <ArrowLeft size={16} />
              我的搭配
            </button>
            <span className="muted">草稿自动保存在本机</span>
          </div>
          <label className="field-label" htmlFor="look-name">
            搭配名称
          </label>
          <input
            id="look-name"
            className="input"
            value={input.name}
            maxLength={80}
            placeholder="例如：周末的松弛感"
            disabled={saving}
            onChange={(e) => setInput((v) => ({ ...v, name: e.target.value }))}
          />
          <p className="muted look-instructions">
            点按选中单品，拖动调整位置；下方可调整大小和前后层次。
          </p>
          <div
            ref={board}
            className="outfit-board"
            style={{ background: input.background }}
            aria-label="搭配画布"
          >
            {!input.layers.length && (
              <div className="look-board-empty">
                <Layers3 size={34} />
                <p>选择衣物，开始搭配</p>
                <button className="button primary" onClick={() => setPicker(true)}>
                  ＋ 添加衣物
                </button>
              </div>
            )}
            {input.layers.map((l) => {
              const item = items.find((g) => g.id === l.garmentId);
              return item ? (
                <div
                  key={l.garmentId}
                  role="button"
                  tabIndex={0}
                  aria-label={`调整${item.name}`}
                  aria-pressed={active === l.garmentId}
                  className={`outfit-piece ${active === l.garmentId ? 'selected' : ''}`}
                  style={{
                    left: `${l.x}%`,
                    top: `${l.y}%`,
                    width: `${l.width}%`,
                    transform: `rotate(${l.rotation}deg)`,
                  }}
                  onPointerDown={(e) => {
                    if (saving) return;
                    e.preventDefault();
                    setActive(l.garmentId);
                    e.currentTarget.setPointerCapture(e.pointerId);
                    drag.current = {
                      id: l.garmentId,
                      px: e.clientX,
                      py: e.clientY,
                      x: l.x,
                      y: l.y,
                    };
                  }}
                  onPointerMove={(e) => {
                    if (!drag.current || drag.current.id !== l.garmentId || !board.current) return;
                    const r = board.current.getBoundingClientRect();
                    updateLayer(l.garmentId, {
                      x: Math.max(
                        0,
                        Math.min(
                          95,
                          drag.current.x + ((e.clientX - drag.current.px) * 100) / r.width,
                        ),
                      ),
                      y: Math.max(
                        0,
                        Math.min(
                          95,
                          drag.current.y + ((e.clientY - drag.current.py) * 100) / r.height,
                        ),
                      ),
                    });
                  }}
                  onPointerUp={() => {
                    drag.current = null;
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                  }}
                  onKeyDown={(e) => {
                    setActive(l.garmentId);
                    const d = 2;
                    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                      e.preventDefault();
                      updateLayer(l.garmentId, {
                        x: Math.max(
                          0,
                          Math.min(
                            95,
                            l.x + (e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0),
                          ),
                        ),
                        y: Math.max(
                          0,
                          Math.min(
                            95,
                            l.y + (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0),
                          ),
                        ),
                      });
                    }
                  }}
                >
                  <Cutout store={store} item={item} />
                </div>
              ) : null;
            })}
          </div>
          <div className="look-controls">
            <button
              className="button primary"
              disabled={saving || input.layers.length >= 12}
              onClick={() => setPicker(true)}
            >
              <Plus size={17} />
              选择衣物 {input.layers.length}/12
            </button>
            {layer && chosen && (
              <>
                <strong>{clothingName(chosen)}</strong>
                <button
                  className="chip"
                  disabled={saving}
                  onClick={() => updateLayer(active, { width: Math.max(10, layer.width - 5) })}
                >
                  缩小
                </button>
                <button
                  className="chip"
                  disabled={saving}
                  onClick={() => updateLayer(active, { width: Math.min(100, layer.width + 5) })}
                >
                  放大
                </button>
                <button
                  className="chip"
                  disabled={saving}
                  onClick={() =>
                    updateLayer(active, {
                      rotation: layer.rotation >= 165 ? -180 : layer.rotation + 15,
                    })
                  }
                >
                  旋转
                </button>
                <button
                  className="chip"
                  disabled={saving}
                  onClick={() =>
                    setInput((v) => ({
                      ...v,
                      layers: [...v.layers.filter((l) => l.garmentId !== active), layer],
                    }))
                  }
                >
                  移到前面
                </button>
                <button
                  className="chip"
                  disabled={saving}
                  onClick={() => {
                    setInput((v) => ({
                      ...v,
                      layers: v.layers.filter((l) => l.garmentId !== active),
                    }));
                    setActive('');
                  }}
                >
                  移除
                </button>
              </>
            )}
          </div>
          <div className="look-backgrounds">
            <span>画布背景</span>
            {backgrounds.map((hex) => (
              <button
                key={hex}
                aria-label={`搭配背景 ${hex}`}
                aria-pressed={input.background === hex}
                className={`background-swatch ${input.background === hex ? 'active' : ''}`}
                style={{ background: hex }}
                disabled={saving}
                onClick={() => setInput((v) => ({ ...v, background: hex }))}
              />
            ))}
          </div>
          <label className="field-label" htmlFor="look-notes">
            搭配备注
          </label>
          <textarea
            id="look-notes"
            className="input"
            value={input.notes}
            rows={2}
            maxLength={1000}
            disabled={saving}
            onChange={(e) => setInput((v) => ({ ...v, notes: e.target.value }))}
            placeholder="场合、穿着感受，或下次想尝试的变化…"
          />
          <button
            className="button primary look-save"
            disabled={saving || !input.layers.length}
            onClick={save}
          >
            <Save size={18} />
            {saving ? '正在保存搭配…' : '保存这套搭配'}
          </button>
        </>
      ) : (
        <>
          <div className="look-top-actions">
            <button className="button primary" onClick={() => begin()}>
              <Plus size={18} />
              {draft ? '继续上次搭配' : '创建搭配'}
            </button>
            <button className="button secondary" onClick={() => setTrash((v) => !v)}>
              {trash ? '返回我的搭配' : '已收起的搭配'}
            </button>
          </div>
          {draft && (
            <button
              className="chip"
              onClick={async () => {
                try {
                  await store.clearLookDraft();
                  setDraft(undefined);
                  notify('搭配草稿已清除');
                } catch (e) {
                  setError(readableError(e));
                }
              }}
            >
              清除未保存的搭配草稿
            </button>
          )}
          <div className="look-gallery">
            {looks
              .filter((l) => Boolean(l.deletedAt) === trash)
              .map((look) => (
                <article className="look-card" key={look.id}>
                  <button
                    className="look-preview"
                    aria-label={`打开搭配${look.name}`}
                    onClick={() => !trash && begin(look)}
                  >
                    <LookImage store={store} look={look} />
                  </button>
                  <h2>{look.name}</h2>
                  <p className="muted">
                    {look.layers.length} 件衣物 · {look.notes || '留住这一套喜欢'}
                  </p>
                  <div className="look-card-actions">
                    {trash ? (
                      <button
                        className="chip"
                        onClick={async () => {
                          try {
                            await store.changeLookTrash(look.id, false);
                            await refresh();
                            notify('搭配已放回');
                          } catch (e) {
                            setError(readableError(e));
                          }
                        }}
                      >
                        <RotateCcw size={14} />
                        放回搭配区
                      </button>
                    ) : (
                      <>
                        <button className="chip" onClick={() => begin(look)}>
                          编辑搭配
                        </button>
                        <button className="chip" onClick={() => setRemove(look)}>
                          <Trash2 size={14} />
                          收起
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
          </div>
          {!looks.filter((l) => Boolean(l.deletedAt) === trash).length && (
            <div className="empty-state">
              <Layers3 size={42} />
              <h2>{trash ? '没有收起的搭配' : '第一套搭配，从这里开始'}</h2>
              <p>从衣橱选择单品，自由摆放，保存你的搭配灵感。</p>
              {!items.some((g) => !g.deletedAt) && (
                <button className="button secondary" onClick={onAddGarment}>
                  先添加衣物
                </button>
              )}
            </div>
          )}
        </>
      )}
      {picker && (
        <Modal title="选择搭配单品" onClose={() => setPicker(false)} wide>
          <input
            className="input"
            aria-label="搜索搭配单品"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索名称、品类、色系…"
          />
          <div className="chips look-picker-groups">
            <button className={`chip ${!group ? 'selected' : ''}`} onClick={() => setGroup('')}>
              全部
            </button>
            {categoryGroups.map((g) => (
              <button
                key={g.id}
                className={`chip ${group === g.id ? 'selected' : ''}`}
                onClick={() => setGroup(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
          <div className="look-picker-grid">
            {shown.map((item) => {
              const selected = input.layers.some((l) => l.garmentId === item.id);
              return (
                <button
                  key={item.id}
                  className={`look-picker-item ${selected ? 'selected' : ''}`}
                  aria-pressed={selected}
                  disabled={!selected && input.layers.length >= 12}
                  onClick={() => add(item)}
                >
                  <AssetImage store={store} item={item} />
                  <strong>{item.name}</strong>
                  <span>{selected ? '✓ 已加入' : clothingName(item)}</span>
                </button>
              );
            })}
          </div>
          {!shown.length && <p className="notice">暂无符合条件的衣物，请先添加衣物或调整筛选。</p>}
          <div className="modal-actions">
            <button className="button primary" onClick={() => setPicker(false)}>
              <Check size={17} />
              完成选择（{input.layers.length}件）
            </button>
          </div>
        </Modal>
      )}
      {remove && (
        <Modal title="暂时收起这套搭配？" onClose={() => setRemove(null)}>
          <p>搭配预览和衣物仍会保留，可以在“已收起的搭配”中恢复。</p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setRemove(null)}>
              保留
            </button>
            <button
              className="button primary"
              onClick={async () => {
                try {
                  await store.changeLookTrash(remove.id, true);
                  setRemove(null);
                  await refresh();
                  notify('搭配已收起，可以随时恢复');
                } catch (e) {
                  setError(readableError(e));
                }
              }}
            >
              收起搭配
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
});
