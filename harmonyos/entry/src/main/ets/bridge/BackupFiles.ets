import { common } from '@kit.AbilityKit';
import { fileIo as fs, picker } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { webview } from '@kit.ArkWeb';

class ExportState {
  file: fs.File;
  expected: number;
  written: number = 0;
  constructor(file: fs.File, expected: number) { this.file = file; this.expected = expected; }
}
interface NativeResult { id: string; ok: boolean; error: string }

// Only exposed to the bundled application. No arbitrary paths are accepted.
export class BackupFiles {
  private context: common.UIAbilityContext;
  private controller: webview.WebviewController;
  private states: Map<string, ExportState> = new Map();
  private pending: Set<string> = new Set();
  constructor(context: common.UIAbilityContext, controller: webview.WebviewController) {
    this.context = context; this.controller = controller;
  }
  private notify(id: string, ok: boolean, error: string): void {
    const detail: NativeResult = { id, ok, error };
    this.controller.runJavaScript(`window.dispatchEvent(new CustomEvent('mori-native-result',{detail:${JSON.stringify(detail)}}))`).catch(() => {});
  }
  beginExport(id: string, name: string, size: number): void {
    if (!/^[a-f0-9-]{36}$/.test(id) || !/^沐衣备份-[0-9-]+-[0-9]+of[0-9]+\.zip$/.test(name) || size <= 0 || size > 64 * 1024 * 1024 || this.pending.size || this.states.size) {
      this.notify(id, false, '导出参数无效或已有备份正在保存'); return;
    }
    this.pending.add(id);
    const documentPicker = new picker.DocumentViewPicker(this.context);
    documentPicker.save({ newFileNames: [name] }).then(uris => {
      if (!this.pending.delete(id)) return;
      if (!uris.length) { this.notify(id, false, '已取消导出'); return; }
      try {
        const file = fs.openSync(uris[0], fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
        this.states.set(id, new ExportState(file, size)); this.notify(id, true, '');
      } catch (_) { this.notify(id, false, '无法写入所选位置，请检查空间和权限'); }
    }).catch(() => { this.pending.delete(id); this.notify(id, false, '未选择保存位置，备份尚未导出'); });
  }
  appendExport(id: string, encoded: string): boolean {
    const state = this.states.get(id);
    if (!state || encoded.length > 350000) return false;
    try {
      const bytes = new util.Base64Helper().decodeSync(encoded);
      if (state.written + bytes.byteLength > state.expected) return false;
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      // fileIo offsets are relative to the file pointer; the default appends at
      // the current pointer. Adding written here would leave gaps in the ZIP.
      const written = fs.writeSync(state.file.fd, buffer, { length: bytes.byteLength });
      state.written += written;
      return written === bytes.byteLength;
    } catch (_) { return false; }
  }
  finishExport(id: string): boolean {
    const state = this.states.get(id); if (!state) return false;
    try { fs.fsyncSync(state.file.fd); fs.closeSync(state.file); this.states.delete(id); return state.written === state.expected; }
    catch (_) { this.cancelExport(id); return false; }
  }
  cancelExport(id: string): void {
    this.pending.delete(id);
    const state = this.states.get(id);
    if (state) { try { fs.closeSync(state.file); } catch (_) {} this.states.delete(id); }
  }
  close(): void {
    this.pending.clear(); this.states.forEach(state => { try { fs.closeSync(state.file); } catch (_) {} }); this.states.clear();
  }
}
