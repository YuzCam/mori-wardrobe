declare global {
  interface Window {
    moriBack?: () => boolean;
    MoriFiles?: {
      beginExport(id: string, name: string, size: number): void;
      appendExport(id: string, data: string): boolean;
      finishExport(id: string): boolean;
      cancelExport(id: string): void;
    };
  }
}
export async function saveBackupFile(blob: Blob, name: string) {
  const bridge = window.MoriFiles;
  if (!bridge) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  const id = crypto.randomUUID();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      bridge.cancelExport(id);
      reject(new Error('选择保存位置超时，请重新导出'));
    }, 180000);
    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener('mori-native-result', listener);
    }
    function listener(event: Event) {
      const detail = (event as CustomEvent<{ id: string; ok: boolean; error?: string }>).detail;
      if (detail.id !== id) return;
      cleanup();
      detail.ok ? resolve() : reject(new Error(detail.error || '已取消导出'));
    }
    window.addEventListener('mori-native-result', listener);
    try {
      bridge.beginExport(id, name, blob.size);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
  try {
    for (let offset = 0; offset < blob.size; offset += 192 * 1024) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + 192 * 1024).arrayBuffer());
      let value = '';
      for (let i = 0; i < bytes.length; i += 8192)
        value += String.fromCharCode(...bytes.subarray(i, i + 8192));
      if (!bridge.appendExport(id, btoa(value)))
        throw new Error('备份写入失败，请检查存储空间并重新导出');
    }
    if (!bridge.finishExport(id)) throw new Error('备份未完整写入，请重新导出');
  } catch (error) {
    bridge.cancelExport(id);
    throw error;
  }
}
