import { openDB } from 'idb';
import { runLocalModel } from './recognition';

// Explicit native diagnostic launch only. Never open the user's wardrobe DB or album.
export async function runSelfTest(root: HTMLElement) {
  root.style.cssText = 'padding:24px;white-space:pre-wrap;font:16px/1.8 system-ui';
  const lines: string[] = ['沐衣 · 本机运行检查', '使用程序生成的图形，不读取个人照片。'];
  const show = () => { root.textContent = lines.join('\n'); };
  const checked = async (name: string, task: () => Promise<void>) => {
    lines.push(`检查中：${name}`);
    show();
    await task();
    lines[lines.length - 1] = `通过：${name}`;
    show();
  };
  show();
  try {
    await checked('安全来源、图片及备份计算能力', async () => {
      if (!window.isSecureContext || !crypto.subtle) throw new Error('本地安全来源不可用');
      const result = await crypto.subtle.digest('SHA-256', new Uint8Array([1, 2, 3]));
      if (result.byteLength !== 32) throw new Error('摘要计算失败');
    });
    await checked('本机数据库与图片读取', async () => {
      const name = 'mori-diagnostic-' + crypto.randomUUID();
      const db = await openDB(name, 1, { upgrade(db) { db.createObjectStore('probe'); } });
      try {
        await db.put('probe', new Blob(['mori-selftest'], { type: 'text/plain' }), 'blob');
        const blob = await db.get('probe', 'blob');
        if (!(blob instanceof Blob) || await blob.text() !== 'mori-selftest')
          throw new Error('图片二进制数据往返不一致');
      } finally {
        db.close();
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error('测试库释放被阻塞'));
        });
      }
    });
    const pixels = (size: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('图片绘制不可用');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, size, size);
      context.fillStyle = '#8d9e82';
      context.beginPath();
      for (const [x, y] of [[.32,.18],[.42,.14],[.58,.14],[.68,.18],[.87,.34],[.72,.48],[.66,.4],[.66,.86],[.34,.86],[.34,.4],[.28,.48],[.13,.34]])
        context.lineTo(x * size, y * size);
      context.closePath(); context.fill();
      return context.getImageData(0, 0, size, size).data;
    };
    await checked('内置抠图模型（Worker / WASM）', async () => {
      const mask = await runLocalModel<Float32Array>('segment', pixels(320), () => {}, new AbortController().signal);
      if (mask.length !== 320 * 320 || !mask.every(Number.isFinite)) throw new Error('抠图输出无效');
    });
    await checked('内置品类与风格模型', async () => {
      const result = await runLocalModel<{categories: {label: string; score: number}[]}>('classify', pixels(224), () => {}, new AbortController().signal);
      if (!result.categories.length || !result.categories.every(x => Number.isFinite(x.score)))
        throw new Error('识别输出无效');
    });
    lines.push('全部运行检查通过。测试图未存入衣橱。');
  } catch (error) {
    lines.push('检查未通过：' + (error instanceof Error ? error.message : String(error)));
  }
  show();
  const back = document.createElement('button');
  back.textContent = '返回我的衣橱';
  back.style.cssText = 'margin-top:24px;padding:12px 20px;font:inherit';
  back.onclick = () => location.replace('/index.html');
  root.append(back);
}
