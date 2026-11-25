import { useEffect, useRef, useState } from 'react';
import { Modal } from './components';

export default function ColorPicker({
  image,
  onPick,
  onClose,
}: {
  image?: HTMLCanvasElement;
  onPick: (hex: string) => void;
  onClose: () => void;
}) {
  const [hex, setHex] = useState('#b59cc3'),
    [message, setMessage] = useState('');
  const ref = useRef<HTMLCanvasElement>(null);
  const palette = useRef<HTMLCanvasElement>(null);
  const [hue, setHue] = useState(280);
  useEffect(() => {
    const c = palette.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = `hsl(${hue} 100% 50%)`;
    ctx.fillRect(0, 0, c.width, c.height);
    const white = ctx.createLinearGradient(0, 0, c.width, 0);
    white.addColorStop(0, 'white');
    white.addColorStop(1, 'transparent');
    ctx.fillStyle = white;
    ctx.fillRect(0, 0, c.width, c.height);
    const black = ctx.createLinearGradient(0, 0, 0, c.height);
    black.addColorStop(0, 'transparent');
    black.addColorStop(1, 'black');
    ctx.fillStyle = black;
    ctx.fillRect(0, 0, c.width, c.height);
  }, [hue]);
  useEffect(() => {
    if (image && ref.current) {
      const c = ref.current;
      const scale = Math.min(1, 800 / image.width);
      c.width = Math.round(image.width * scale);
      c.height = Math.round(image.height * scale);
      c.getContext('2d')!.drawImage(image, 0, 0, c.width, c.height);
    }
  }, [image]);
  const valid = /^#[0-9a-f]{6}$/i.test(hex);
  return (
    <Modal title="自定义色系" onClose={onClose}>
      <p className="muted">选择喜欢的颜色，或点按照片中的衣物取色。</p>
      <canvas
        ref={palette}
        width={400}
        height={200}
        className="color-palette"
        role="img"
        aria-label="点按调色板选择颜色"
        onPointerDown={(e) => {
          const c = palette.current!,
            r = c.getBoundingClientRect(),
            p = c
              .getContext('2d')!
              .getImageData(
                Math.min(
                  c.width - 1,
                  Math.max(0, Math.floor(((e.clientX - r.left) * c.width) / r.width)),
                ),
                Math.min(
                  c.height - 1,
                  Math.max(0, Math.floor(((e.clientY - r.top) * c.height) / r.height)),
                ),
                1,
                1,
              ).data;
          setHex(
            '#' +
              Array.from(p.slice(0, 3))
                .map((v) => v.toString(16).padStart(2, '0'))
                .join(''),
          );
          setMessage('已选取调色板颜色');
        }}
      />
      <label className="hue-control">
        色相
        <input
          type="range"
          aria-label="调整自定义色相"
          min={0}
          max={360}
          value={hue}
          onChange={(e) => setHue(Number(e.target.value))}
        />
      </label>
      <div className="custom-color-inputs">
        <label>
          颜色
          <input
            aria-label="选择自定义颜色"
            type="color"
            value={valid ? hex : '#b59cc3'}
            onChange={(e) => {
              setHex(e.target.value);
              setMessage('');
            }}
          />
        </label>
        <label>
          颜色值
          <input
            className="input"
            aria-label="自定义颜色值"
            value={hex}
            maxLength={7}
            onChange={(e) => setHex(e.target.value)}
            placeholder="#AABBCC"
          />
        </label>
        <span className="picked-swatch" style={{ background: valid ? hex : '#eee' }} />
      </div>
      {image && (
        <>
          <p className="field-label">从图片中手动取色</p>
          <canvas
            ref={ref}
            className="color-sampling-image"
            role="img"
            aria-label="点按衣物图片取色"
            onPointerDown={(e) => {
              const c = ref.current!,
                r = c.getBoundingClientRect();
              const x = Math.max(
                  0,
                  Math.min(c.width - 1, Math.floor(((e.clientX - r.left) * c.width) / r.width)),
                ),
                y = Math.max(
                  0,
                  Math.min(c.height - 1, Math.floor(((e.clientY - r.top) * c.height) / r.height)),
                );
              const rgba = c.getContext('2d')!.getImageData(x, y, 1, 1).data;
              if (rgba[3] < 50) {
                setMessage('请点在衣物上取色');
                return;
              }
              setHex(
                '#' +
                  Array.from(rgba.slice(0, 3))
                    .map((v) => v.toString(16).padStart(2, '0'))
                    .join(''),
              );
              setMessage('已选取图片中的颜色');
            }}
          />
        </>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          取消
        </button>
        <button
          className="button primary"
          disabled={!valid}
          onClick={() => onPick(hex.toLowerCase())}
        >
          添加这个色系
        </button>
      </div>
    </Modal>
  );
}
