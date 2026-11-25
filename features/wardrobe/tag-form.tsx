'use client';
import { categories, colors, styles, seasons } from '../../config/taxonomy';
import type { GarmentInput } from '../../types/wardrobe';
import { toggle } from '../../components/ui/common';
import { Check, Info } from 'lucide-react';
export default function TagForm({
  value,
  onChange,
  disabled = false,
}: {
  value: GarmentInput;
  onChange: (value: GarmentInput) => void;
  disabled?: boolean;
}) {
  const set = (key: keyof GarmentInput, v: any) =>
    onChange({
      ...value,
      [key]: v,
      recognition: value.recognition ? { ...value.recognition, confirmed: true } : null,
    });
  return (
    <fieldset className="tag-form" disabled={disabled}>
      <label className="field-label" htmlFor="garment-name">
        单品名称<span>给它一个好记的名字</span>
      </label>
      <input
        id="garment-name"
        className="input"
        value={value.name}
        onChange={(e) => set('name', e.target.value)}
        maxLength={80}
        placeholder="例如：燕麦色软糯针织衫"
      />
      <div className="field-label">
        品类<span>选择一项</span>
      </div>
      <div className="chip-group">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip ${value.category === c.id ? 'selected' : ''}`}
            onClick={() => set('category', c.id)}
            aria-pressed={value.category === c.id}
          >
            {c.name}
            {value.category === c.id && <Check size={12} />}
          </button>
        ))}
      </div>
      <div className="field-label">
        适用季节<span>可多选，冬夏都选即跨季</span>
      </div>
      <div className="chip-group">
        {seasons.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip ${value.seasons.includes(s.id) ? 'selected' : ''}`}
            onClick={() => set('seasons', toggle(value.seasons, s.id))}
            aria-pressed={value.seasons.includes(s.id)}
          >
            {s.name}
            {value.seasons.includes(s.id) && <Check size={12} />}
          </button>
        ))}
      </div>
      <div className="field-label">
        色系<span>最多三项，第一项为主色</span>
      </div>
      <div className="chip-group">
        {colors.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip color-chip ${value.colors.includes(c.id) ? 'selected' : ''}`}
            onClick={() => {
              if (value.colors.includes(c.id) || value.colors.length < 3)
                set('colors', toggle(value.colors, c.id));
            }}
            aria-pressed={value.colors.includes(c.id)}
          >
            <i style={{ background: c.hex }} />
            {c.name}
            {value.colors.includes(c.id) && <Check size={12} />}
          </button>
        ))}
      </div>
      <div className="field-label">
        风格<span>最多四项，也可以暂时不选</span>
      </div>
      <div className="chip-group">
        {styles.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip ${value.styles.includes(s.id) ? 'selected' : ''}`}
            onClick={() => {
              if (value.styles.includes(s.id) || value.styles.length < 4)
                set('styles', toggle(value.styles, s.id));
            }}
            aria-pressed={value.styles.includes(s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <label className="field-label" htmlFor="warmth">
        保暖程度<span>照片难以判断，请按实际感受选择</span>
      </label>
      <select
        id="warmth"
        className="input"
        value={value.warmth}
        onChange={(e) => set('warmth', Number(e.target.value))}
      >
        <option value={0}>轻薄 · 炎热天气</option>
        <option value={1}>适中 · 春秋或叠穿</option>
        <option value={2}>保暖 · 偏冷天气</option>
        <option value={3}>厚实 · 冬季保暖</option>
      </select>
      <label className="field-label" htmlFor="garment-notes">
        备注<span>选填</span>
      </label>
      <textarea
        className="input"
        id="garment-notes"
        rows={3}
        value={value.notes}
        onChange={(e) => set('notes', e.target.value)}
        maxLength={1000}
        placeholder="材质、尺码，或者关于它的小故事…"
      />
      <p className="hint">
        <Info size={14} />
        自动建议可以随时修改，以你的选择为准。
      </p>
    </fieldset>
  );
}
