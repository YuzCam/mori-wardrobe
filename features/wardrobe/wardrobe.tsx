'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  SlidersHorizontal,
  Plus,
  X,
  ArrowUpRight,
  Pencil,
  Trash2,
  Check,
  LoaderCircle,
  Shirt,
  ArrowLeft,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWardrobe, useRefreshWardrobe } from './hooks';
import {
  categories,
  colors,
  styles,
  seasons,
  categoryName,
  styleName,
} from '../../config/taxonomy';
import { emptyFilters, filterGarments, type Filters } from './filter';
import { Loading, ErrorState, EmptyWardrobe, toggle } from '../../components/ui/common';
import Modal from '../../components/ui/modal';
import GarmentCard from './card';
import TagForm from './tag-form';
import type { Garment, GarmentInput } from '../../types/wardrobe';
import { api, patch } from '../../lib/client/api';
import { garmentSchema } from '../../lib/validation/garment';
export default function Wardrobe({ owner, initialId }: { owner: string; initialId?: string }) {
  const query = useWardrobe(owner);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [ready, setReady] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(
      location.search || (initialId ? (sessionStorage.getItem(`mori:filters:${owner}`) ?? '') : ''),
    );
    setFilters({
      q: p.get('q') ?? '',
      categories: p.getAll('category'),
      seasons: p.getAll('season'),
      colors: p.getAll('color'),
      styles: p.getAll('style'),
      sort: p.get('sort') ?? 'newest',
    });
    setReady(true);
  }, [owner, initialId]);
  useEffect(() => {
    if (!ready || initialId) return;
    const p = new URLSearchParams();
    if (filters.q) p.set('q', filters.q);
    for (const [key, values] of [
      ['category', filters.categories],
      ['season', filters.seasons],
      ['color', filters.colors],
      ['style', filters.styles],
    ] as [string, string[]][])
      for (const v of values) p.append(key, v);
    if (filters.sort !== 'newest') p.set('sort', filters.sort);
    sessionStorage.setItem(`mori:filters:${owner}`, p.toString());
    history.replaceState(null, '', `/wardrobe${p.size ? `?${p}` : ''}`);
  }, [filters, ready, initialId, owner]);
  const items = query.data?.items ?? [];
  const shown = useMemo(() => filterGarments(items, filters), [items, filters]);
  const count =
    filters.categories.length +
    filters.seasons.length +
    filters.colors.length +
    filters.styles.length;
  const set = (key: keyof Filters, value: any) => setFilters((v) => ({ ...v, [key]: value }));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">EVERY PIECE HAS ITS PLACE</p>
          <h1>
            我的衣橱<span className="heading-dot">.</span>
          </h1>
          <p>喜欢的都在这里，慢慢找到今天的心动。</p>
        </div>
        <a href="/upload" className="button primary">
          <Plus size={18} />
          添加衣物
        </a>
      </div>
      <div className="wardrobe-overview">
        <div>
          <Shirt size={17} />
          <strong>{items.length}</strong>
          <span>件心爱单品</span>
        </div>
        <span className="overview-divider" />
        <div>
          <strong>{items.filter((g) => g.seasons.includes('winter')).length}</strong>
          <span>冬季</span>
        </div>
        <div>
          <strong>{items.filter((g) => g.seasons.includes('summer')).length}</strong>
          <span>夏季</span>
        </div>
        <span className="overview-caption">让每一件，都有出场机会</span>
      </div>
      <div className="wardrobe-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            placeholder="搜索单品、颜色、风格…"
            aria-label="搜索衣物"
            value={filters.q}
            onChange={(e) => set('q', e.target.value)}
          />
          {filters.q && (
            <button className="icon-button" onClick={() => set('q', '')} aria-label="清空搜索">
              <X size={15} />
            </button>
          )}
        </label>
        <button
          className={`button secondary filter-button ${count ? 'is-filtered' : ''}`}
          onClick={() => setFilterOpen(true)}
        >
          <SlidersHorizontal size={17} />
          筛选{count > 0 && <span className="filter-count">{count}</span>}
        </button>
        <select
          className="sort-select"
          aria-label="排列顺序"
          value={filters.sort}
          onChange={(e) => set('sort', e.target.value)}
        >
          <option value="newest">最近添加</option>
          <option value="oldest">最早添加</option>
          <option value="name">按名称排列</option>
        </select>
      </div>
      <div className="category-tabs" aria-label="按品类筛选">
        <button
          className={!filters.categories.length ? 'active' : ''}
          onClick={() => set('categories', [])}
        >
          全部单品<span>{items.length}</span>
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={filters.categories.includes(c.id) ? 'active' : ''}
            onClick={() => set('categories', toggle(filters.categories, c.id))}
          >
            {c.name}
          </button>
        ))}
      </div>
      {(count > 0 || filters.q) && (
        <div className="active-filters">
          <span>找到 {shown.length} 件</span>
          {filters.seasons.map((s) => (
            <button key={s} onClick={() => set('seasons', toggle(filters.seasons, s))}>
              {s === 'winter' ? '冬季' : '夏季'}
              <X size={12} />
            </button>
          ))}
          {[
            ...filters.colors.map((id) => ({
              id,
              name: colors.find((c) => c.id === id)?.name,
              key: 'colors',
            })),
            ...filters.styles.map((id) => ({ id, name: styleName(id), key: 'styles' })),
          ].map((t) => (
            <button
              key={t.id}
              onClick={() =>
                set(t.key as keyof Filters, toggle(filters[t.key as 'colors' | 'styles'], t.id))
              }
            >
              {t.name}
              <X size={12} />
            </button>
          ))}
          <button className="clear-filters" onClick={() => setFilters(emptyFilters)}>
            清空条件
          </button>
        </div>
      )}
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState message={query.error.message} retry={() => query.refetch()} />
      ) : !items.length ? (
        <EmptyWardrobe />
      ) : !shown.length ? (
        <div className="empty-results">
          <Search size={32} />
          <h3>暂时没有找到这样的单品</h3>
          <p>换个关键词，或放宽一点筛选条件。</p>
          <button className="button secondary" onClick={() => setFilters(emptyFilters)}>
            清空筛选
          </button>
        </div>
      ) : (
        <div className="garment-grid">
          {shown.map((g) => (
            <GarmentCard key={g.id} garment={g} />
          ))}
        </div>
      )}
      {filterOpen && (
        <Modal title="找到你想穿的那一件" onClose={() => setFilterOpen(false)}>
          <p className="hint">同一组可多选，不同组一起筛选。</p>
          {(
            [
              {
                key: 'seasons',
                title: '适用季节',
                options: seasons.map((s) => ({ id: s.id, name: s.name })),
              },
              { key: 'categories', title: '衣物品类', options: categories },
              { key: 'colors', title: '色系', options: colors },
              { key: 'styles', title: '风格', options: styles },
            ] as const
          ).map((group) => (
            <div key={group.key} className="filter-section">
              <h3>{group.title}</h3>
              <div className="chip-group">
                {group.options.map((option: any) => (
                  <button
                    key={option.id}
                    className={`chip ${filters[group.key].includes(option.id) ? 'selected' : ''}`}
                    aria-pressed={filters[group.key].includes(option.id)}
                    onClick={() => set(group.key, toggle(filters[group.key], option.id))}
                  >
                    {option.hex && <i className="color-dot" style={{ background: option.hex }} />}{' '}
                    {option.name}
                    {filters[group.key].includes(option.id) && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setFilters(emptyFilters)}>
              重置
            </button>
            <button className="button primary" onClick={() => setFilterOpen(false)}>
              查看 {shown.length} 件单品
              <ArrowUpRight size={16} />
            </button>
          </div>
        </Modal>
      )}
      {initialId && query.data && (
        <GarmentDetail
          owner={owner}
          garment={items.find((g) => g.id === initialId)}
          onClose={() =>
            window.location.assign(
              `/wardrobe${sessionStorage.getItem(`mori:filters:${owner}`) ? '?' + sessionStorage.getItem(`mori:filters:${owner}`) : ''}`,
            )
          }
        />
      )}
    </>
  );
}
function GarmentDetail({
  owner,
  garment,
  onClose,
}: {
  owner: string;
  garment?: Garment;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [value, setValue] = useState<GarmentInput | null>(garment ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useRefreshWardrobe(owner);
  if (!garment || !value)
    return (
      <Modal title="单品详情" onClose={onClose}>
        <p>这件衣物不存在或已被删除。</p>
        <button className="button secondary" onClick={onClose}>
          返回衣橱
        </button>
      </Modal>
    );
  async function save() {
    if (!garment) return;
    const valid = garmentSchema.safeParse(value);
    if (!valid.success) {
      setError(valid.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await patch(`/api/garments/${garment.id}`, { ...valid.data, revision: garment.revision });
      await refresh();
      setEditing(false);
      toast.success('单品信息已更新');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!garment) return;
    setBusy(true);
    try {
      await api(`/api/garments/${garment.id}`, { method: 'DELETE' });
      await refresh();
      toast.success('已从衣橱移除');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={editing ? '编辑单品信息' : '衣橱里的这一件'}
      onClose={() => !busy && onClose()}
      wide
    >
      <div className="detail-grid">
        <div className="detail-image" style={{ background: garment.recipe.background }}>
          <img src={garment.imageUrl} alt={garment.name} />
          <span className="pill">{categoryName(garment.category)}</span>
        </div>
        <div className="detail-info">
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {confirmDelete ? (
            <div className="delete-confirm">
              <Trash2 size={30} />
              <h3>确定移除这件衣物？</h3>
              <p>单品图片也会删除，包含它的穿搭将不再展示。可以先在设置中导出备份。</p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => setConfirmDelete(false)}
                  disabled={busy}
                >
                  保留它
                </button>
                <button className="button danger" onClick={remove} disabled={busy}>
                  {busy ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
                  确认移除
                </button>
              </div>
            </div>
          ) : editing ? (
            <>
              <TagForm value={value} onChange={setValue} disabled={busy} />
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => {
                    setValue(garment);
                    setEditing(false);
                  }}
                  disabled={busy}
                >
                  取消
                </button>
                <button className="button primary" onClick={save} disabled={busy}>
                  {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}保存修改
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow">ONE OF YOUR FAVORITES</p>
              <h2>{garment.name}</h2>
              <div className="detail-tags">
                <span className="pill">{categoryName(garment.category)}</span>
                {garment.seasons.map((s) => (
                  <span className="pill" key={s}>
                    {s === 'winter' ? '冬季' : '夏季'}
                  </span>
                ))}
              </div>
              <h3>它的颜色</h3>
              <div className="chip-group">
                {garment.colors.map((id) => {
                  const c = colors.find((x) => x.id === id);
                  return (
                    <span className="chip" key={id}>
                      <i className="color-dot" style={{ background: c?.hex }} />
                      {c?.name}
                    </span>
                  );
                })}
              </div>
              <h3>风格关键词</h3>
              <div className="chip-group">
                {garment.styles.length ? (
                  garment.styles.map((id) => (
                    <span className="chip" key={id}>
                      {styleName(id)}
                    </span>
                  ))
                ) : (
                  <span className="subtle">还没有风格标签</span>
                )}
              </div>
              <h3>关于它</h3>
              <p className="detail-notes">{garment.notes || '暂时没有备注，喜欢本身就是理由。'}</p>
              <p className="detail-date">
                加入衣橱 · {new Date(garment.createdAt).toLocaleDateString('zh-CN')}
              </p>
              <div className="detail-actions">
                <button className="button primary" onClick={() => setEditing(true)}>
                  <Pencil size={16} />
                  修改信息
                </button>
                <a className="button secondary" href={`/?lock=${garment.id}`}>
                  <SparklesIcon />
                  围绕它搭配
                </a>
              </div>
              <a className="text-link" href={`/upload?edit=${garment.id}`}>
                重新整理图片
                <ArrowUpRight size={14} />
              </a>
              <button className="text-link muted-link" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} />
                移除这件衣物
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
function SparklesIcon() {
  return <Tag size={15} />;
}
