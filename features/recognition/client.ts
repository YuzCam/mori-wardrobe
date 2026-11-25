export type ModelProgress = { stage: string; loaded?: number; total?: number };
export function runModel<T>(
  type: 'segment' | 'classify',
  pixels: Uint8ClampedArray,
  onProgress: (p: ModelProgress) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    onProgress({ stage: '正在启动本地图片处理' });
    const worker = new Worker('/workers/image-processing.js', { type: 'module' });
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener('abort', abort);
      clearTimeout(timeout);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('已取消处理', 'AbortError'));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('设备处理时间较长，已保留图片，可以稍后重试或手动确认标签'));
    }, 180000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    worker.onmessage = (e) => {
      if (e.data.type === 'ready') worker.postMessage({ type, pixels }, [pixels.buffer]);
      else if (e.data.type === 'progress') onProgress(e.data.progress);
      else if (e.data.type === 'result') {
        cleanup();
        resolve(e.data.result);
      } else {
        cleanup();
        reject(new Error(e.data.error));
      }
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error('当前浏览器未能运行图片识别，照片已保留，可手动编辑或重试'));
    };
  });
}
