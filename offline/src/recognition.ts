export type ModelProgress = { stage: string; loaded?: number; total?: number };
export function runLocalModel<T>(
  type: 'segment' | 'classify',
  pixels: Uint8ClampedArray,
  progress: (p: ModelProgress) => void,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    progress({ stage: '正在启动本机图片处理' });
    const worker = new Worker('/workers/image-processing.js', { type: 'module' });
    const cleanup = () => {
      worker.terminate();
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('已取消自动处理', 'AbortError'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('本机处理超时，照片已保留，可继续手动整理'));
    }, 120000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) return abort();
    worker.onmessage = (e) => {
      if (e.data.type === 'ready')
        worker.postMessage({ type, pixels, offline: true }, [pixels.buffer]);
      else if (e.data.type === 'progress') progress(e.data.progress);
      else if (e.data.type === 'result') {
        cleanup();
        resolve(e.data.result);
      } else {
        cleanup();
        reject(new Error(e.data.error || '自动处理未完成'));
      }
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error('当前设备未能运行本地模型，照片已保留，可手动圈选和分类'));
    };
  });
}
