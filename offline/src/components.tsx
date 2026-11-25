import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import { colors, colorHex, colorName, customColor, seasons, styles } from '../../config/taxonomy';
import {
  categoryGroups,
  clothingGroup,
  clothingName,
  detailedCategories,
} from '../../config/clothing';
import ColorPicker from './color-picker';
import type { GarmentInput } from '../../types/wardrobe';
import type { AssetKind, LocalGarment } from './types';
import type { WardrobeStore } from './store';
import { toggle } from './filter';

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? 'wide' : ''}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) {
          const r = dialog.current!.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Loading({ text = '正在打开本机衣橱…' }: { text?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
      {text}
    </div>
  );
}
export function AssetImage({
  store,
  item,
  kind = 'thumbnail',
  className = '',
}: {
  store: WardrobeStore;
  item: LocalGarment;
  kind?: AssetKind;
  className?: string;
}) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false,
      objectUrl = '';
    setUrl('');
    setFailed(false);
    store
      .asset(item.id, kind)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setFailed(true);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [store, item.id, item.revision, kind]);
  return url && !failed ? (
    <img
      className={className}
      src={url}
      alt={item.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="image-placeholder">
      {failed ? '图片未能读取' : <LoaderCircle size={18} className="spin" />}
    </span>
  );
}
export function TagFields({
  value,
  onChange,
  disabled,
  sampleImage,
}: {
  value: GarmentInput;
  onChange: (value: GarmentInput) => void;
  disabled?: boolean;
  sampleImage?: HTMLCanvasElement;
}) {
  const [group, setGroup] = useState(() => clothingGroup(value));
  const [pickingColor, setPickingColor] = useState(false);
  useEffect(() => setGroup(clothingGroup(value)), [value.category, value.subcategory]);
  const set = (key: keyof GarmentInput, next: unknown) => onChange({ ...value, [key]: next });
  return (
    <fieldset disabled={disabled} className="tag-fields">
      <label className="field-label" htmlFor="item-name">
        单品名称<span>必填</span>
      </label>
      <input
        id="item-name"
        className="input"
        value={value.name}
        maxLength={80}
        placeholder="例如：燕麦色针织衫"
        onChange={(e) => set('name', e.target.value)}
      />
      <fieldset className="tag-group">
        <legend>
          品类 <span>选择一项</span>
        </legend>
        <div className="chips">
          {categoryGroups.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`chip ${group === c.id ? 'selected' : ''}`}
              aria-pressed={group === c.id}
              onClick={() => setGroup(c.id)}
            >
              {c.name}
              {group === c.id && <Check size={12} />}
            </button>
          ))}
        </div>
        <div className="chips category-details">
          {detailedCategories
            .filter((c) => c.group === group)
            .map((c) => (
              <button
                type="button"
                key={c.id}
                className={`chip ${value.subcategory === c.id ? 'selected' : ''}`}
                aria-pressed={value.subcategory === c.id}
                onClick={() => onChange({ ...value, category: c.category, subcategory: c.id })}
              >
                {c.name}
                {value.subcategory === c.id && <Check size={12} />}
              </button>
            ))}
        </div>
        {!value.subcategory && (
          <p className="muted">当前原分类：{clothingName(value)}。可补充选择上面的细分类。</p>
        )}
      </fieldset>
      <fieldset className="tag-group">
        <legend>
          适用季节 <span>必选，可多选</span>
        </legend>
        <div className="chips">
          {seasons.map((s) => (
            <button
              type="button"
              key={s.id}
              className={`chip ${value.seasons.includes(s.id) ? 'selected' : ''}`}
              aria-pressed={value.seasons.includes(s.id)}
              onClick={() => set('seasons', toggle(value.seasons, s.id))}
            >
              {s.name}
              {value.seasons.includes(s.id) && <Check size={12} />}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="tag-group">
        <legend>
          色系 <span>必选，最多三项</span>
        </legend>
        <div className="chips">
          {[
            ...colors,
            ...value.colors
              .filter(customColor)
              .map((id) => ({ id, name: colorName(id), hex: colorHex(id) })),
          ].map((c) => (
            <button
              type="button"
              key={c.id}
              className={`chip ${value.colors.includes(c.id) ? 'selected' : ''}`}
              aria-pressed={value.colors.includes(c.id)}
              disabled={!value.colors.includes(c.id) && value.colors.length >= 3}
              onClick={() => set('colors', toggle(value.colors, c.id))}
            >
              <i className="color-dot" style={{ background: c.hex }} />
              {c.name}
              {value.colors.includes(c.id) && <Check size={12} />}
            </button>
          ))}
          <button
            type="button"
            className="chip custom-color-add"
            disabled={value.colors.length >= 3}
            onClick={() => setPickingColor(true)}
          >
            ＋ 自定义 / 图片取色
          </button>
        </div>
      </fieldset>
      <fieldset className="tag-group">
        <legend>
          风格 <span>选填，最多四项</span>
        </legend>
        <div className="chips">
          {styles.map((s) => (
            <button
              type="button"
              key={s.id}
              className={`chip ${value.styles.includes(s.id) ? 'selected' : ''}`}
              aria-pressed={value.styles.includes(s.id)}
              disabled={!value.styles.includes(s.id) && value.styles.length >= 4}
              onClick={() => set('styles', toggle(value.styles, s.id))}
            >
              {s.name}
              {value.styles.includes(s.id) && <Check size={12} />}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="field-label" htmlFor="item-notes">
        小小备注<span>{value.notes.length}/1000</span>
      </label>
      <textarea
        id="item-notes"
        className="input"
        rows={3}
        value={value.notes}
        maxLength={1000}
        onChange={(e) => set('notes', e.target.value)}
        placeholder="尺码、材质，或关于它的一点小事…"
      />
      {pickingColor && (
        <ColorPicker
          image={sampleImage}
          onClose={() => setPickingColor(false)}
          onPick={(hex) => {
            set('colors', [...new Set([...value.colors, `custom:${hex}`])].slice(0, 3));
            setPickingColor(false);
          }}
        />
      )}
    </fieldset>
  );
}
