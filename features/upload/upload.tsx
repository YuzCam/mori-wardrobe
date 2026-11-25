'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Camera,
  ImagePlus,
  UploadCloud,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCheck,
  LoaderCircle,
  ShieldCheck,
  Info,
  X,
  CircleCheck,
  Scissors,
  Tag,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/client/api';
import { clearDraft, loadDraft, saveDraft, type UploadDraft } from '../../lib/client/draft-store';
import { defaultRecipe, type GarmentInput, type Garment } from '../../types/wardrobe';
import { categories, colorName, categoryName } from '../../config/taxonomy';
import { garmentSchema } from '../../lib/validation/garment';
import {
  decodeImage,
  fullMask,
  blobOf,
  maskFromPrediction,
  boundingCrop,
  renderGarment,
  pixelsFor,
  clipPixels,
  canvas,
} from '../image-editor/engine';
import ImageEditor from '../image-editor/editor';
import TagForm from '../wardrobe/tag-form';
import { extractColors } from '../recognition/color-extraction';
import { runModel, type ModelProgress } from '../recognition/client';
import { usePreferences, useRefreshWardrobe } from '../wardrobe/hooks';
const baseInput: GarmentInput = {
  name: '',
  category: 'top',
  seasons: [],
  colors: [],
  styles: [],
  notes: '',
  warmth: 1,
  recipe: defaultRecipe,
  recognition: null,
};
export default function Upload({ owner }: { owner: string }) {
  const [editing, setEditing] = useState<{ id: string; revision: number } | null>(null);
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const album = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [original, setOriginal] = useState<HTMLCanvasElement | null>(null);
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [mask, setMask] = useState<HTMLCanvasElement | null>(null);
  const [version, setVersion] = useState(0);
  const [input, setInput] = useState<GarmentInput>(baseInput);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<ModelProgress>({ stage: '' });
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<UploadDraft | null>(null);
  const [saved, setSaved] = useState<Garment | null>(null);
  const [preview, setPreview] = useState('');
  const [dragging, setDragging] = useState(false);
  const [draftStatus, setDraftStatus] = useState('');
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const { data: prefs } = usePreferences(owner);
  const refresh = useRefreshWardrobe(owner);
  useEffect(() => {
    const id = editId;
    if (id) {
      setBusy(true);
      setProgress({ stage: '正在取出这件衣物' });
      (async () => {
        const g = await api<Garment>('/api/garments/' + encodeURIComponent(id));
        const fetchBlob = async (url: string) => {
          const r = await fetch(url);
          if (!r.ok) throw new Error('图片读取失败，请重新打开后再试');
          return r.blob();
        };
        const b = await fetchBlob(g.originalUrl);
        const c = await decodeImage(b);
        const m = g.maskUrl
          ? await decodeImage(await fetchBlob(g.maskUrl))
          : fullMask(c.width, c.height);
        setEditing({ id: g.id, revision: g.revision });
        setOriginal(c);
        setOriginalBlob(b);
        setMask(m);
        setInput(g);
        setStep(2);
        setVersion((v) => v + 1);
      })()
        .catch((e) => setError(e.message))
        .finally(() => setBusy(false));
    } else
      loadDraft(owner)
        .then((d) => d && setDraft(d))
        .catch(() => {});
    return () => controller.current?.abort();
  }, [owner, editId]);
  useEffect(() => {
    if (!originalBlob || !mask || step === 4) return;
    const timer = setTimeout(async () => {
      try {
        await saveDraft(owner, {
          id: 'current',
          original: originalBlob,
          mask: await blobOf(mask),
          recipe: input.recipe,
          input,
          step,
          savedAt: new Date().toISOString(),
          editingId: editing?.id,
          revision: editing?.revision,
        });
        setDraftStatus('草稿已保存在本机');
      } catch {
        setDraftStatus('本机空间不足，请尽快保存');
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [originalBlob, mask, version, input, step, owner, editing]);
  useEffect(() => {
    if (!original || !mask || step < 3) return;
    let url = '';
    const result = renderGarment(original, mask, input.recipe);
    blobOf(result).then((b) => {
      url = URL.createObjectURL(b);
      setPreview(url);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [original, mask, version, input.recipe, step]);
  async function restore() {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const c = await decodeImage(draft.original);
      const m = draft.mask ? await decodeImage(draft.mask) : fullMask(c.width, c.height);
      setOriginal(c);
      setOriginalBlob(draft.original);
      setMask(m);
      setInput(draft.input);
      setEditing(
        draft.editingId && draft.revision
          ? { id: draft.editingId, revision: draft.revision }
          : null,
      );
      setStep(Math.min(3, Math.max(2, draft.step)));
      setDraft(null);
      toast.success('已恢复上次编辑');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function recognize(c: HTMLCanvasElement, skipSegmentation = false) {
    const current = ++generation.current;
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    setBusy(true);
    setWarning('');
    const warnings: string[] = [];
    let m = mask ?? fullMask(c.width, c.height);
    let crop = input.recipe.crop;
    try {
      if (!skipSegmentation) {
        const prediction = await runModel<Float32Array>(
          'segment',
          pixelsFor(c, 320),
          setProgress,
          abort.signal,
        );
        if (current !== generation.current) return;
        m = maskFromPrediction(prediction, 320, c.width, c.height);
        crop = boundingCrop(m);
        if (!crop) throw new Error('没有找到清晰主体，请手动圈选衣物');
        setMask(m);
        setVersion((v) => v + 1);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        if (current === generation.current) {
          setBusy(false);
          setWarning('自动处理已取消，可继续手动圈选并确认标签。');
        }
        return;
      }
      warnings.push(`自动抠图未完成：${(e as Error).message}`);
      m = fullMask(c.width, c.height);
      setMask(m);
    }
    const extracted = extractColors(c, m);
    if (current !== generation.current) return;
    setInput((v) => ({
      ...v,
      colors: extracted,
      recipe: { ...v.recipe, crop },
      seasons: v.seasons.length ? v.seasons : [],
      name: v.name || (extracted.length ? `${colorName(extracted[0])}单品` : ''),
    }));
    try {
      const cutout = renderGarment(c, m, { ...defaultRecipe, crop }, false, 600);
      const result = await runModel<{
        categories: { label: Garment['category']; score: number }[];
        styles: { label: string; score: number }[];
        seasons: { label: 'summer' | 'winter'; score: number }[];
      }>('classify', clipPixels(cutout), setProgress, abort.signal);
      if (current !== generation.current) return;
      const best = result.categories[0];
      const clearCategory = best && best.score - (result.categories[1]?.score ?? 0) > 0.02;
      setInput((v) => ({
        ...v,
        category: best?.label ?? v.category,
        name: `${extracted.length ? colorName(extracted[0]) : ''}${categoryName(best?.label ?? v.category)}`,
        seasons:
          result.seasons?.length &&
          result.seasons[0].score - (result.seasons[1]?.score ?? 0) > 0.025
            ? [result.seasons[0].label]
            : [],
        styles:
          result.styles.length && result.styles[0].score - (result.styles[1]?.score ?? 0) > 0.025
            ? [result.styles[0].label]
            : [],
        recognition: {
          model: 'U2NetP + CLIP ViT-B/32 q8',
          categoryCandidates: result.categories,
          styleCandidates: result.styles,
          source: 'model',
          confirmed: false,
        },
      }));
      if (!clearCategory)
        warnings.push('品类候选接近，请确认品类；季节和保暖程度请按实际情况选择。');
    } catch (e) {
      if ((e as Error).name !== 'AbortError')
        warnings.push(`自动分类未完成：${(e as Error).message}`);
      else warnings.push('自动分类已取消，已保留图片和色系建议。');
    } finally {
      if (current === generation.current) {
        setBusy(false);
        setWarning(warnings.join(' '));
        setProgress({ stage: '' });
      }
    }
  }
  async function choose(file?: File) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('这张照片超过 20MB，请选择较小的照片');
      return;
    }
    if (file.type === 'image/svg+xml') {
      setError('请选择照片，暂不支持 SVG 文件');
      return;
    }
    setError('');
    setWarning('');
    setBusy(true);
    setProgress({ stage: '正在读取并优化照片' });
    try {
      const c = await decodeImage(file, 1400);
      const normalized = await blobOf(c, 'image/jpeg', 0.92);
      setOriginal(c);
      setOriginalBlob(normalized);
      setMask(fullMask(c.width, c.height));
      setInput({ ...baseInput, recipe: { ...defaultRecipe } });
      setDraft(null);
      setStep(2);
      setVersion((v) => v + 1);
      await recognize(c);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    } finally {
      if (album.current) album.current.value = '';
      if (camera.current) camera.current.value = '';
    }
  }
  async function save() {
    if (!original || !mask || !originalBlob) return;
    const validated = garmentSchema.safeParse({
      ...input,
      recognition: input.recognition ? { ...input.recognition, confirmed: true } : null,
    });
    if (!validated.success) {
      setError(validated.error.issues[0].message);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const transparent = renderGarment(original, mask, input.recipe, true);
      const thumb = canvas(400, 440);
      const ctx = thumb.getContext('2d')!;
      const scale = Math.min(340 / transparent.width, 380 / transparent.height);
      ctx.drawImage(
        transparent,
        (400 - transparent.width * scale) / 2,
        (440 - transparent.height * scale) / 2,
        transparent.width * scale,
        transparent.height * scale,
      );
      const form = new FormData();
      form.set(
        'metadata',
        JSON.stringify({ ...validated.data, ...(editing ? { revision: editing.revision } : {}) }),
      );
      form.set('original', originalBlob, 'original.jpg');
      form.set('image', await blobOf(transparent), 'garment.png');
      form.set('thumbnail', await blobOf(thumb), 'thumbnail.png');
      form.set('mask', await blobOf(mask), 'mask.png');
      const garment = await api<Garment>(
        editing ? '/api/garments/' + editing.id : '/api/garments',
        { method: editing ? 'PATCH' : 'POST', body: form },
      );
      setSaved(garment);
      setStep(4);
      await clearDraft(owner).catch(() => {});
      await refresh();
      toast.success(editing ? '单品图片已更新' : '已收进你的衣橱');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function reset() {
    controller.current?.abort();
    generation.current++;
    setStep(1);
    setOriginal(null);
    setOriginalBlob(null);
    setMask(null);
    setInput(baseInput);
    setBusy(false);
    setWarning('');
    setError('');
    setSaved(null);
    setEditing(null);
    history.replaceState(null, '', '/upload');
    setDraftStatus('');
    clearDraft(owner).catch(() => {});
  }
  const percent = progress.total
    ? Math.min(100, Math.round(((progress.loaded ?? 0) / progress.total) * 100))
    : null;
  return (
    <div className="upload-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">A NEW PIECE, A NEW POSSIBILITY</p>
          <h1>
            把喜欢，收进衣橱<span className="heading-dot">.</span>
          </h1>
          <p>一张照片，开启它的下一次出场。</p>
        </div>
        <span className="privacy-note">
          <ShieldCheck size={15} />
          照片在设备上处理
        </span>
      </div>
      <ol className="upload-steps">
        {[
          { n: 1, label: '选择照片', icon: ImagePlus },
          { n: 2, label: '整理图片', icon: Scissors },
          { n: 3, label: '确认标签', icon: Tag },
        ].map((s) => (
          <li key={s.n} className={step > s.n ? 'done' : step === s.n ? 'active' : ''}>
            <span>{step > s.n ? <Check size={15} /> : s.n}</span>
            <b>{s.label}</b>
          </li>
        ))}
      </ol>
      {error && (
        <div className="inline-error" role="alert">
          {error}
          <button className="icon-button" aria-label="关闭错误提示" onClick={() => setError('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {step === 1 && (
        <>
          <div
            className={`upload-dropzone ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              choose(e.dataTransfer.files[0]);
            }}
          >
            <div className="upload-illustration">
              <span className="upload-photo-back" />
              <div>
                <ImagePlus size={48} strokeWidth={1.2} />
                <i>
                  <PlusIcon />
                </i>
              </div>
            </div>
            <span className="pill">为每一件喜欢，留个位置</span>
            <h2>从一张衣物照片开始</h2>
            <p>
              拍照，或选择相册里的照片
              <br />
              我们会帮你提取主体、整理色系和分类。
            </p>
            <div className="upload-actions">
              <button
                className="button primary"
                onClick={() => album.current?.click()}
                disabled={busy}
              >
                <ImagePlus size={18} />
                从相册选择
              </button>
              <button
                className="button secondary"
                onClick={() => camera.current?.click()}
                disabled={busy}
              >
                <Camera size={18} />
                拍一张
              </button>
            </div>
            <small>
              JPEG / PNG / WebP · 单张不超过 20MB
              <br className="mobile-only" />
              也可以把照片拖到这里
            </small>
          </div>
          {draft && (
            <div className="draft-banner">
              <RotateCcw size={20} />
              <div>
                <strong>有一件单品，等你继续整理</strong>
                <p>本机保存于 {new Date(draft.savedAt).toLocaleString('zh-CN')}</p>
              </div>
              <button className="button secondary small" onClick={restore} disabled={busy}>
                继续编辑
              </button>
              <button
                className="icon-button"
                aria-label="删除草稿"
                onClick={() => {
                  clearDraft(owner);
                  setDraft(null);
                }}
              >
                <X size={17} />
              </button>
            </div>
          )}
          <div className="upload-tips">
            <div>
              <span>01</span>
              <h3>一次拍一件</h3>
              <p>平铺或悬挂，衣物轮廓更清楚。</p>
            </div>
            <div>
              <span>02</span>
              <h3>让光线自然一点</h3>
              <p>柔和光线有助于保留真实色彩。</p>
            </div>
            <div>
              <span>03</span>
              <h3>简单背景就很好</h3>
              <p>与衣物有反差，抠图会更轻松。</p>
            </div>
          </div>
          <p className="model-note">
            <Info size={15} />
            首次使用会下载本地模型（抠图约 4.4MB，分类约 85MB），以后复用缓存。HEIC
            若无法读取，请转换为 JPEG。
          </p>
        </>
      )}
      {(step === 2 || step === 3) && original && mask && (
        <>
          <div className="editing-grid">
            <section className="editing-image-panel">
              <div className="panel-heading">
                <h2>{step === 2 ? '让它看起来，更像它自己' : '单品预览'}</h2>
                <span className="subtle">原图保留</span>
              </div>
              {step === 2 ? (
                <ImageEditor
                  original={original}
                  mask={mask}
                  version={version}
                  recipe={input.recipe}
                  onRecipe={(recipe) => setInput((v) => ({ ...v, recipe }))}
                  onMask={(m) => {
                    setMask(m);
                    setVersion((v) => v + 1);
                  }}
                  disabled={busy || saving}
                />
              ) : (
                <div className="confirm-preview" style={{ background: input.recipe.background }}>
                  {preview && <img src={preview} alt="处理后的单品预览" />}
                  <span className="pill">
                    <CheckCheck size={14} />
                    图片已准备好
                  </span>
                </div>
              )}
            </section>
            <aside className="editing-side-panel">
              {step === 2 ? (
                <>
                  <div className="panel-heading">
                    <h2>
                      <Sparkles size={17} />
                      自动整理
                    </h2>
                    <span className="pill small">本地处理</span>
                  </div>
                  {busy ? (
                    <div className="recognition-progress" role="status">
                      <LoaderCircle className="spin" size={26} />
                      <h3>{progress.stage}</h3>
                      {progress.loaded !== undefined && (
                        <p>
                          {(progress.loaded / 1048576).toFixed(1)}MB
                          {progress.total
                            ? ` / ${(progress.total / 1048576).toFixed(1)}MB`
                            : ' 已读取'}
                        </p>
                      )}
                      <div className={`progress-track ${percent === null ? 'indeterminate' : ''}`}>
                        <span style={{ width: percent === null ? '36%' : `${percent}%` }} />
                      </div>
                      <button className="text-link" onClick={() => controller.current?.abort()}>
                        取消自动处理
                      </button>
                    </div>
                  ) : (
                    <div className="recognition-summary">
                      <CircleCheck size={31} />
                      <h3>{input.recognition ? '识别建议已准备好' : '现在可以继续整理'}</h3>
                      <p>检查主体边缘，调整到你喜欢的样子，再确认分类标签。</p>
                      <button
                        className="button secondary small"
                        onClick={() => recognize(original)}
                      >
                        <Sparkles size={15} />
                        重新自动整理
                      </button>
                    </div>
                  )}
                  {warning && (
                    <p className="warning-box" role="status">
                      {warning}
                    </p>
                  )}
                  <div className="editing-notes">
                    <h3>一点小提示</h3>
                    <p>细肩带、蕾丝和相近色背景，可能需要用画笔补一下。</p>
                    <p>“圈选主体”会保留圈内区域；“擦除”和“保留”用于修正细节。</p>
                    <p>保暖程度和适用季节，下一步由你确认。</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="panel-heading">
                    <h2>这是它的小档案</h2>
                    <span className="pill small">
                      {input.recognition?.confirmed ? '已确认' : '请确认'}
                    </span>
                  </div>
                  {input.recognition && (
                    <p className="hint">
                      <Sparkles size={14} />
                      品类候选：
                      {input.recognition.categoryCandidates
                        .map((c) => categoryName(c.label))
                        .join(' / ')}
                      。风格和季节请按实际确认。
                    </p>
                  )}
                  <TagForm value={input} onChange={setInput} disabled={saving} />
                </>
              )}
            </aside>
          </div>
          <div className="upload-bottom-bar">
            <div>
              <ShieldCheck size={14} />
              <span>{draftStatus || '编辑内容会自动保存为本机草稿'}</span>
            </div>
            <div>
              <button
                className="button secondary"
                onClick={() => setStep(step === 2 ? 1 : 2)}
                disabled={busy || saving}
              >
                <ArrowLeft size={16} />
                {step === 2 ? '重新选择' : '调整图片'}
              </button>
              <button
                className="button primary"
                onClick={() => {
                  setError('');
                  step === 2 ? setStep(3) : save();
                }}
                disabled={busy || saving}
              >
                {saving ? (
                  <LoaderCircle className="spin" size={17} />
                ) : step === 2 ? (
                  <Tag size={17} />
                ) : (
                  <Check size={17} />
                )}
                {saving
                  ? '正在保存…'
                  : step === 2
                    ? '确认分类标签'
                    : editing
                      ? '保存修改'
                      : '收进衣橱'}
                {!saving && <ArrowRight size={16} />}
              </button>
            </div>
          </div>
        </>
      )}
      {step === 4 && saved && (
        <div className="upload-success">
          <span className="success-check">
            <Check size={36} />
          </span>
          <p className="eyebrow">A LOVELY NEW ADDITION</p>
          <h2>{editing ? '这一件，又有了新模样。' : '喜欢的，又多了一件。'}</h2>
          <p>「{saved.name}」已收进你的私人衣橱。</p>
          <div className="saved-garment" style={{ background: saved.recipe.background }}>
            <img src={saved.thumbnailUrl} alt={saved.name} />
          </div>
          <div className="upload-actions">
            <button className="button primary" onClick={reset}>
              <ImagePlus size={18} />
              继续添加
            </button>
            <a className="button secondary" href={`/wardrobe/${saved.id}`}>
              查看这件单品
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      )}
      <input
        ref={album}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="visually-hidden"
        onChange={(e) => choose(e.target.files?.[0])}
        aria-label="从相册选择衣物照片"
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        onChange={(e) => choose(e.target.files?.[0])}
        aria-label="拍摄衣物照片"
      />
    </div>
  );
}
function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
