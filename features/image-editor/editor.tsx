'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Eraser,
  Paintbrush,
  Lasso,
  Crop,
  RotateCw,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Move,
  ScanLine,
  Eye,
  RefreshCcw,
} from 'lucide-react';
import type { EditRecipe } from '../../types/wardrobe';
import { backgrounds } from '../../config/taxonomy';
import { canvas, fullMask, boundingCrop, decodeImage } from './engine';
type Tool = 'view' | 'erase' | 'keep' | 'lasso' | 'crop';
type Point = { x: number; y: number };
export default function ImageEditor({
  original,
  mask,
  recipe,
  onRecipe,
  onMask,
  version,
  disabled,
}: {
  original: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  recipe: EditRecipe;
  onRecipe: (r: EditRecipe) => void;
  onMask: (m: HTMLCanvasElement) => void;
  version: number;
  disabled?: boolean;
}) {
  const display = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('view');
  const [size, setSize] = useState(28);
  const [zoom, setZoom] = useState(1);
  const [showOriginal, setShowOriginal] = useState(false);
  const [paths, setPaths] = useState<Point[]>([]);
  const drawing = useRef(false);
  const points = useRef<Point[]>([]);
  const history = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const snapshot = () => {
    history.current.push(mask.toDataURL('image/png'));
    if (history.current.length > 8) history.current.shift();
    future.current = [];
    setHistoryVersion((v) => v + 1);
  };
  const restore = async (direction: 'undo' | 'redo') => {
    const source = direction === 'undo' ? history.current : future.current,
      target = direction === 'undo' ? future.current : history.current;
    const url = source.pop();
    if (!url) return;
    target.push(mask.toDataURL());
    const image = new Image();
    image.onload = () => {
      const c = canvas(mask.width, mask.height);
      c.getContext('2d')!.drawImage(image, 0, 0, c.width, c.height);
      onMask(c);
      setHistoryVersion((v) => v + 1);
    };
    image.src = url;
  };
  useEffect(() => {
    const c = display.current;
    if (!c) return;
    c.width = original.width;
    c.height = original.height;
    const ctx = c.getContext('2d')!;
    ctx.filter = `brightness(${recipe.brightness}%) contrast(${recipe.contrast}%)`;
    ctx.drawImage(original, 0, 0);
    ctx.filter = 'none';
    if (!showOriginal) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = recipe.background;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (recipe.crop) {
      const r = recipe.crop;
      ctx.strokeStyle = '#806791';
      ctx.lineWidth = Math.max(2, original.width / 350);
      ctx.setLineDash([12, 8]);
      ctx.strokeRect(r.x * c.width, r.y * c.height, r.width * c.width, r.height * c.height);
      ctx.setLineDash([]);
    }
    if (paths.length) {
      ctx.beginPath();
      paths.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.strokeStyle = '#77608d';
      ctx.lineWidth = original.width / 250;
      ctx.stroke();
      if (tool === 'crop' && paths.length > 1) {
        const a = paths[0],
          b = paths[paths.length - 1];
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      }
    }
  }, [original, mask, recipe, version, showOriginal, paths, tool]);
  function point(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(original.width, ((e.clientX - rect.left) / rect.width) * original.width),
      ),
      y: Math.max(
        0,
        Math.min(original.height, ((e.clientY - rect.top) / rect.height) * original.height),
      ),
    };
  }
  function paint(a: Point, b: Point) {
    const ctx = mask.getContext('2d')!;
    ctx.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = (size * original.width) / 400;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x + 0.01, b.y + 0.01);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    onMask(mask);
  }
  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === 'view' || disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    snapshot();
    drawing.current = true;
    const p = point(e);
    points.current = [p];
    if (tool === 'erase' || tool === 'keep') paint(p, p);
    else setPaths([p]);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const p = point(e);
    if (tool === 'erase' || tool === 'keep') paint(points.current[points.current.length - 1], p);
    points.current.push(p);
    if (tool === 'crop') setPaths([points.current[0], p]);
    else if (tool === 'lasso') setPaths([...points.current]);
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    const p = points.current;
    if (tool === 'lasso' && p.length > 3) {
      const ctx = mask.getContext('2d')!;
      ctx.clearRect(0, 0, mask.width, mask.height);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      p.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
      ctx.closePath();
      ctx.fill();
      onMask(mask);
    }
    if (tool === 'crop' && p.length > 1) {
      const a = p[0],
        b = p[p.length - 1];
      if (Math.abs(a.x - b.x) > 20 && Math.abs(a.y - b.y) > 20)
        onRecipe({
          ...recipe,
          crop: {
            x: Math.min(a.x, b.x) / original.width,
            y: Math.min(a.y, b.y) / original.height,
            width: Math.abs(a.x - b.x) / original.width,
            height: Math.abs(a.y - b.y) / original.height,
          },
        });
    }
    setPaths([]);
  }
  const tools = [
    { id: 'view', icon: Move, label: '查看' },
    { id: 'crop', icon: Crop, label: '裁剪' },
    { id: 'lasso', icon: Lasso, label: '圈选主体' },
    { id: 'erase', icon: Eraser, label: '擦除' },
    { id: 'keep', icon: Paintbrush, label: '保留' },
  ];
  return (
    <div className="editor">
      <div className="editor-toolbar">
        {tools.map((t) => (
          <button
            key={t.id}
            className={`editor-tool ${tool === t.id ? 'active' : ''}`}
            onClick={() => setTool(t.id as Tool)}
            disabled={disabled}
            aria-pressed={tool === t.id}
          >
            <t.icon size={17} />
            {t.label}
          </button>
        ))}
        <span className="toolbar-divider" />
        <button
          className="icon-button"
          onClick={() => restore('undo')}
          disabled={!history.current.length || disabled}
          aria-label="撤销修边"
        >
          <Undo2 size={17} />
        </button>
        <button
          className="icon-button"
          onClick={() => restore('redo')}
          disabled={!future.current.length || disabled}
          aria-label="重做修边"
        >
          <Redo2 size={17} />
        </button>
      </div>
      <div className="editor-stage checkerboard">
        <div className="editor-canvas-scroll">
          <canvas
            ref={display}
            style={{ transform: `scale(${zoom})`, touchAction: tool === 'view' ? 'pan-y' : 'none' }}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            aria-label="衣物图片编辑区域"
          />
        </div>
        <div className="editor-bottom-tools">
          <button
            className={`mini-button ${showOriginal ? 'active' : ''}`}
            onClick={() => setShowOriginal(!showOriginal)}
          >
            <Eye size={14} />
            {showOriginal ? '查看处理结果' : '对比原图'}
          </button>
          <span>
            <button
              aria-label="缩小"
              className="icon-button"
              onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
            >
              <ZoomOut size={16} />
            </button>
            <small>{Math.round(zoom * 100)}%</small>
            <button
              aria-label="放大"
              className="icon-button"
              onClick={() => setZoom(Math.min(2.5, zoom + 0.25))}
            >
              <ZoomIn size={16} />
            </button>
          </span>
        </div>
      </div>
      <p className="editor-instruction">
        {tool === 'view'
          ? '选择工具编辑图片；原图会完整保留。'
          : tool === 'crop'
            ? '拖动画出裁剪区域，保存时应用裁剪。'
            : tool === 'lasso'
              ? '沿衣物边缘画一圈，只保留圈选区域。'
              : tool === 'erase'
                ? '在多余的背景上涂抹，将它擦除。'
                : '涂抹恢复被误删的衣物细节。'}
      </p>
      <div className="editor-adjustments">
        {(tool === 'erase' || tool === 'keep') && (
          <label>
            画笔大小
            <input
              type="range"
              min={5}
              max={80}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            />
            <span>{size}</span>
          </label>
        )}
        <label>
          亮度
          <input
            type="range"
            min={50}
            max={150}
            value={recipe.brightness}
            onChange={(e) => onRecipe({ ...recipe, brightness: Number(e.target.value) })}
            disabled={disabled}
          />
          <span>{recipe.brightness}%</span>
        </label>
        <label>
          对比度
          <input
            type="range"
            min={50}
            max={150}
            value={recipe.contrast}
            onChange={(e) => onRecipe({ ...recipe, contrast: Number(e.target.value) })}
            disabled={disabled}
          />
          <span>{recipe.contrast}%</span>
        </label>
        <div className="background-row">
          <span>背景颜色</span>
          <div>
            {backgrounds.map((b) => (
              <button
                key={b}
                className={`background-swatch ${recipe.background === b ? 'active' : ''}`}
                style={{ background: b }}
                aria-label={`背景 ${b}`}
                aria-pressed={recipe.background === b}
                onClick={() => onRecipe({ ...recipe, background: b })}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
        <div className="editor-secondary-tools">
          <button
            className="mini-button"
            onClick={() => onRecipe({ ...recipe, crop: boundingCrop(mask) })}
            disabled={disabled}
          >
            <ScanLine size={14} />
            主体裁剪
          </button>
          <button
            className="mini-button"
            onClick={() => onRecipe({ ...recipe, rotation: (recipe.rotation + 90) % 360 })}
            disabled={disabled}
          >
            <RotateCw size={14} />
            旋转 {recipe.rotation}°
          </button>
          <button
            className="mini-button"
            onClick={() => {
              snapshot();
              onMask(fullMask(original.width, original.height));
              onRecipe({ ...recipe, brightness: 100, contrast: 100, crop: null, rotation: 0 });
            }}
            disabled={disabled}
          >
            <RefreshCcw size={14} />
            还原图片
          </button>
        </div>
      </div>
    </div>
  );
}
