import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ImagePlus,
  LoaderCircle,
  Save,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react';
import ImageEditor from '../../features/image-editor/editor';
import {
  blobOf,
  boundingCrop,
  canvas,
  clipPixels,
  decodeImage,
  fullMask,
  maskFromPrediction,
  pixelsFor,
  renderGarment,
} from '../../features/image-editor/engine';
import { extractColors } from '../../features/recognition/color-extraction';
import { categoryName, colorName } from '../../config/taxonomy';
import { defaultRecipe, type Category, type GarmentInput, type Season } from '../../types/wardrobe';
import { garmentSchema } from '../../lib/validation/garment';
import type { WardrobeStore } from './store';
import { readableError } from './store';
import type { EditSession, LocalGarment } from './types';
import { runLocalModel, type ModelProgress } from './recognition';
import { Loading, Modal, TagFields } from './components';

const blankInput = (): GarmentInput => ({
  name: '',
  category: 'top',
  seasons: [],
  colors: [],
  styles: [],
  notes: '',
  warmth: 1,
  recipe: { ...defaultRecipe },
  recognition: null,
});
export type EditorHandle = { flush: () => Promise<void> };
export default forwardRef<
  EditorHandle,
  {
    store: WardrobeStore;
    autoProcess: boolean;
    editing?: LocalGarment;
    onSaved: () => void;
    notify: (text: string) => void;
  }
>(function Editor({ store, autoProcess, editing, onSaved, notify }, ref) {
  const [session, setSession] = useState<EditSession | null>(null);
  const [step, setStep] = useState<'image' | 'tags'>('image');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [reading, setReading] = useState(Boolean(editing));
  const [progress, setProgress] = useState<ModelProgress>({ stage: '' });
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState(''),
    [warning, setWarning] = useState(''),
    [draftMessage, setDraftMessage] = useState('');
  const [draftAvailable, setDraftAvailable] = useState(false),
    [discardConfirm, setDiscardConfirm] = useState(false);
  const [preview, setPreview] = useState('');
  const album = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    saved = useRef(false),
    live = useRef(true);
  const latest = useRef({ session, step, reading, saving });
  latest.current = { session, step, reading, saving };
  const drafts = useRef(Promise.resolve());
  useEffect(() => {
    const onPickerState = (event: Event) => {
      const detail = (event as CustomEvent<{ state: string; message?: string }>).detail;
      setPicking(detail.state === 'opening');
      if (detail.state === 'error') setError(detail.message || '未能打开照片选择器，请重试');
      if (detail.state === 'cancelled') notify('已取消选择照片');
    };
    window.addEventListener('mori-picker-state', onPickerState);
    return () => window.removeEventListener('mori-picker-state', onPickerState);
  }, []);
  async function persistDraft() {
    const state = latest.current;
    if (saved.current || !state.session) return;
    const current = state.session;
    // Serialize autosaves so a slow canvas export cannot overwrite newer edits.
    const next = drafts.current
      .catch(() => {})
      .then(async () => {
        if (saved.current) return;
        const maskBlob = await blobOf(current.mask);
        if (saved.current) return;
        await store.saveDraft({
          id: 'current',
          input: structuredClone(current.input),
          original: current.originalBlob,
          mask: maskBlob,
          editingId: current.editingId,
          revision: current.revision,
          step: state.step,
          savedAt: new Date().toISOString(),
        });
      });
    drafts.current = next;
    await next;
  }
  useImperativeHandle(ref, () => ({
    flush: async () => {
      if (latest.current.reading || latest.current.saving)
        throw new Error('正在读取或保存照片，请稍后再离开');
      controller.current?.abort();
      await persistDraft();
    },
  }));
  useEffect(() => {
    live.current = true;
    (async () => {
      if (editing) {
        const assets = await store.assets(editing.id);
        const original = await decodeImage(assets.original, 1400),
          mask = await decodeImage(assets.mask, 1400);
        if (!live.current) return;
        setSession({
          original,
          originalBlob: assets.original,
          mask,
          input: editing,
          editingId: editing.id,
          revision: editing.revision,
        });
      } else setDraftAvailable(Boolean(await store.draft()));
    })()
      .catch((e) => live.current && setError(readableError(e)))
      .finally(() => live.current && setReading(false));
    return () => {
      live.current = false;
      controller.current?.abort();
      generation.current++;
    };
  }, [store, editing?.id]);
  useEffect(() => {
    if (!session || saved.current) return;
    const timer = setTimeout(
      () =>
        persistDraft()
          .then(() => live.current && setDraftMessage('草稿已保存在本机'))
          .catch(() => live.current && setDraftMessage('草稿未保存，请勿离开；可尝试直接保存衣物')),
      650,
    );
    return () => clearTimeout(timer);
  }, [session, version, step]);
  useEffect(() => {
    if (!session || step !== 'tags') return;
    let url = '',
      cancelled = false;
    blobOf(renderGarment(session.original, session.mask, session.input.recipe, false, 700))
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
      })
      .catch((e) => !cancelled && setError(readableError(e)));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [session, version, step]);
  async function restoreDraft() {
    setReading(true);
    setError('');
    try {
      const draft = await store.draft();
      if (!draft) throw new Error('没有找到草稿');
      const original = await decodeImage(draft.original, 1400),
        mask = await decodeImage(draft.mask, 1400);
      setSession({
        original,
        originalBlob: draft.original,
        mask,
        input: draft.input,
        editingId: draft.editingId,
        revision: draft.revision,
      });
      setStep(draft.step);
      setDraftAvailable(false);
      notify('已恢复上次整理');
    } catch (e) {
      setError(readableError(e));
    } finally {
      setReading(false);
    }
  }
  async function choose(file?: File) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('照片超过20MB，请选择较小的照片');
      return;
    }
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      setError('请选择JPEG、PNG、WebP等照片文件');
      return;
    }
    setReading(true);
    setError('');
    setWarning('');
    try {
      const original = await decodeImage(file, 1400),
        originalBlob = await blobOf(original, 'image/jpeg', 0.92),
        mask = fullMask(original.width, original.height);
      if (!live.current) return;
      const extracted = extractColors(original, mask);
      const input = {
        ...blankInput(),
        colors: extracted,
        name: extracted.length ? `${colorName(extracted[0])}单品` : '',
      };
      const next = { original, originalBlob, mask, input };
      setSession(next);
      setStep('image');
      setDraftAvailable(false);
      setReading(false);
      if (autoProcess) await recognize(next);
      else setWarning('已保留原图。可以手动圈选主体，或点击“自动整理”。');
    } catch (e) {
      if (live.current) setError(readableError(e));
    } finally {
      if (live.current) setReading(false);
      if (album.current) album.current.value = '';
      if (camera.current) camera.current.value = '';
    }
  }
  async function recognize(current: EditSession) {
    const job = ++generation.current;
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    setBusy(true);
    setWarning('');
    setError('');
    let mask = current.mask,
      crop = current.input.recipe.crop;
    const warnings: string[] = [];
    try {
      try {
        const predicted = await runLocalModel<Float32Array>(
          'segment',
          pixelsFor(current.original, 320),
          setProgress,
          abort.signal,
        );
        if (job !== generation.current) return;
        mask = maskFromPrediction(predicted, 320, current.original.width, current.original.height);
        crop = boundingCrop(mask);
        if (!crop) throw new Error('没有找到清晰主体，请手动圈选');
        setSession(
          (s) => s && { ...s, mask, input: { ...s.input, recipe: { ...s.input.recipe, crop } } },
        );
        setVersion((v) => v + 1);
      } catch (e) {
        if (abort.signal.aborted) throw e;
        warnings.push(`自动抠图未完成：${readableError(e)}`);
      }
      const extracted = extractColors(current.original, mask);
      setSession((s) => s && { ...s, input: { ...s.input, colors: extracted } });
      try {
        const rendered = renderGarment(
          current.original,
          mask,
          { ...defaultRecipe, crop },
          false,
          600,
        );
        const result = await runLocalModel<{
          categories: { label: Category; score: number }[];
          styles: { label: string; score: number }[];
          seasons: { label: Season; score: number }[];
        }>('classify', clipPixels(rendered), setProgress, abort.signal);
        if (job !== generation.current) return;
        const best = result.categories[0];
        const certainSeason =
          result.seasons[0] && result.seasons[0].score - (result.seasons[1]?.score ?? 0) > 0.025;
        const certainStyle =
          result.styles[0] && result.styles[0].score - (result.styles[1]?.score ?? 0) > 0.025;
        setSession(
          (s) =>
            s && {
              ...s,
              input: {
                ...s.input,
                category: best?.label ?? s.input.category,
                subcategory:
                  best?.label && best.label !== s.input.category ? undefined : s.input.subcategory,
                name: `${extracted.length ? colorName(extracted[0]) : ''}${categoryName(best?.label ?? s.input.category)}`,
                seasons: certainSeason ? [result.seasons[0].label] : [],
                styles: certainStyle ? [result.styles[0].label] : [],
                recognition: {
                  model: 'U2NetP + CLIP ViT-B/32 q8（本机）',
                  categoryCandidates: result.categories,
                  styleCandidates: result.styles,
                  source: 'model',
                  confirmed: false,
                },
              },
            },
        );
        warnings.push('分类是本机模型的建议，保存前请确认品类、季节和色系。');
      } catch (e) {
        if (abort.signal.aborted) throw e;
        warnings.push(`自动分类未完成：${readableError(e)}，请手动确认标签。`);
      }
    } catch (e) {
      warnings.push(
        abort.signal.aborted ? '自动处理已取消，已保留图片，可以继续手动整理。' : readableError(e),
      );
    } finally {
      if (job === generation.current && live.current) {
        setBusy(false);
        setProgress({ stage: '' });
        setWarning(warnings.join(' '));
      }
    }
  }
  async function save() {
    if (!session || busy || saving) return;
    if (!session.editingId && !session.input.subcategory) {
      setError('请选择衣物的具体细分类');
      return;
    }
    const input = {
      ...session.input,
      recognition: session.input.recognition
        ? { ...session.input.recognition, confirmed: true }
        : null,
    };
    const valid = garmentSchema.safeParse(input);
    if (!valid.success) {
      setError(valid.error.issues[0].message);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await drafts.current.catch(() => {});
      const image = renderGarment(session.original, session.mask, input.recipe, true, 1400);
      const thumb = canvas(400, 440),
        context = thumb.getContext('2d')!,
        scale = Math.min(350 / image.width, 390 / image.height);
      context.drawImage(
        image,
        (400 - image.width * scale) / 2,
        (440 - image.height * scale) / 2,
        image.width * scale,
        image.height * scale,
      );
      const images = {
        original: session.originalBlob,
        image: await blobOf(image),
        thumbnail: await blobOf(thumb),
        mask: await blobOf(session.mask),
      };
      const draftSnapshot = latest.current;
      saved.current = true;
      try {
        await store.save(
          valid.data,
          images,
          session.editingId ? { id: session.editingId, revision: session.revision! } : undefined,
        );
      } catch (e) {
        saved.current = false;
        latest.current = draftSnapshot;
        throw e;
      }
      notify(session.editingId ? '已更新这件衣物' : '已收进本机衣橱');
      onSaved();
    } catch (e) {
      setError(readableError(e));
      setSaving(false);
    }
  }
  return (
    <div className="import-page">
      <div className="page-title">
        <p className="eyebrow">A PLACE FOR EVERY PIECE</p>
        <h1>
          {editing ? '编辑衣物' : '收进一件喜欢'}
          <span>.</span>
        </h1>
        <p>一张照片，慢慢整理成自己的衣橱。</p>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {reading ? (
        <Loading text="正在读取本机照片…" />
      ) : !session ? (
        <>
          {draftAvailable ? (
            <div className="draft-banner">
              <Save size={22} />
              <div>
                <strong>上次的整理，还替你留着</strong>
                <p>恢复后继续编辑，图片和标签都在。</p>
              </div>
              <button className="button primary small" onClick={restoreDraft}>
                继续整理
              </button>
              <button
                className="icon-button"
                aria-label="丢弃草稿"
                onClick={() => setDiscardConfirm(true)}
              >
                <X size={17} />
              </button>
            </div>
          ) : null}
          {!draftAvailable && (
            <div className="import-card">
              <div className="import-illustration">
                <ImagePlus size={50} strokeWidth={1} />
                <span>+</span>
              </div>
              <h2>让喜欢的衣物，有自己的位置</h2>
              <p>每次整理一件，原图完整保留。</p>
              <div className="import-actions">
                <button
                  className="button primary"
                  disabled={picking}
                  onClick={() => {
                    setError('');
                    album.current?.click();
                  }}
                >
                  <ImagePlus size={18} />
                  从相册选择
                </button>
                <button className="button secondary" onClick={() => camera.current?.click()}>
                  <Camera size={18} />
                  拍一张照片
                </button>
              </div>
              <small>支持常见照片格式 · 单张不超过20MB</small>
              <div className="local-note">
                <Check size={15} />
                照片只保存在这台设备，不会上传
              </div>
            </div>
          )}
          <div className="import-guide">
            <span>
              <b>01</b>选择照片
            </span>
            <i />
            <span>
              <b>02</b>整理图片
            </span>
            <i />
            <span>
              <b>03</b>确认标签
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="step-tabs">
            <button
              className={step === 'image' ? 'active' : ''}
              disabled={busy || saving}
              onClick={() => setStep('image')}
            >
              <Scissors size={16} />
              1. 整理图片
            </button>
            <button
              className={step === 'tags' ? 'active' : ''}
              disabled={busy || saving}
              onClick={() => setStep('tags')}
            >
              <Check size={16} />
              2. 确认标签
            </button>
          </div>
          {busy && (
            <div className="process-banner" role="status">
              <LoaderCircle className="spin" size={21} />
              <div>
                <strong>{progress.stage}</strong>
                <p>
                  全部在本机完成，照片不会上传。
                  {progress.total
                    ? ` ${Math.round(((progress.loaded ?? 0) / progress.total) * 100)}%`
                    : ''}
                </p>
              </div>
              <button
                className="button secondary small"
                onClick={() => controller.current?.abort()}
              >
                取消处理
              </button>
            </div>
          )}
          {warning && (
            <p className="notice" role="status">
              {warning}
            </p>
          )}
          {step === 'image' ? (
            <>
              <div className="editor-action">
                <span>保留每一处细节</span>
                <button
                  className="button secondary small"
                  disabled={busy || saving}
                  onClick={() => recognize(session)}
                >
                  <Sparkles size={15} />
                  自动整理
                </button>
              </div>
              <ImageEditor
                key={session.editingId ?? 'new'}
                original={session.original}
                mask={session.mask}
                recipe={session.input.recipe}
                onRecipe={(recipe) =>
                  setSession((s) => s && { ...s, input: { ...s.input, recipe } })
                }
                onMask={(mask) => {
                  setSession((s) => s && { ...s, mask });
                  setVersion((v) => v + 1);
                }}
                version={version}
                disabled={busy || saving}
              />
              <div className="form-footer">
                <span>{draftMessage}</span>
                <button
                  className="button primary"
                  disabled={busy || saving}
                  onClick={() => {
                    setError('');
                    setStep('tags');
                    window.scrollTo({ top: 0 });
                  }}
                >
                  确认图片
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          ) : (
            <div className="tags-layout">
              <div className="tag-preview" style={{ background: session.input.recipe.background }}>
                {preview && <img src={preview} alt="处理后的衣物预览" />}
                <span>本机单品图</span>
              </div>
              <div>
                <p className="notice">自动标签可以点击修改，季节和色系需要至少选择一项。</p>
                <TagFields
                  value={session.input}
                  onChange={(input) => setSession((s) => s && { ...s, input })}
                  disabled={saving}
                  sampleImage={session.original}
                />
                <div className="form-footer">
                  <button
                    className="button secondary"
                    disabled={saving}
                    onClick={() => setStep('image')}
                  >
                    <ArrowLeft size={16} />
                    返回图片
                  </button>
                  <button className="button primary" disabled={saving} onClick={save}>
                    {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{' '}
                    {saving ? '保存到本机…' : '保存衣物'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      <input
        ref={album}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => choose(e.target.files?.[0])}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => choose(e.target.files?.[0])}
      />
      {discardConfirm && (
        <Modal title="丢弃这份草稿？" onClose={() => setDiscardConfirm(false)}>
          <p>仅移除尚未保存的这次整理，衣橱里的衣物不会受影响。</p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setDiscardConfirm(false)}>
              保留草稿
            </button>
            <button
              className="button danger"
              onClick={async () => {
                try {
                  await store.clearDraft();
                  setDraftAvailable(false);
                  setDiscardConfirm(false);
                  notify('草稿已移除');
                } catch (e) {
                  setError(readableError(e));
                }
              }}
            >
              丢弃草稿
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
});
