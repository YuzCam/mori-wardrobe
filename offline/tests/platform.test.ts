import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers.ts';
const { saveBackupFile } = await import('../src/platform.ts');
function platform() {
  const target = new EventTarget() as unknown as Window;
  Object.defineProperty(globalThis, 'window', { value: target, configurable: true });
  return target;
}
test('native export sends every byte in bounded chunks and waits for completed writes', async () => {
  const target = platform(),
    chunks: Buffer[] = [];
  let expected = 0,
    completed = false;
  target.MoriFiles = {
    beginExport(id, name, size) {
      assert.ok(name.endsWith('.zip'));
      expected = size;
      queueMicrotask(() =>
        target.dispatchEvent(new CustomEvent('mori-native-result', { detail: { id, ok: true } })),
      );
    },
    appendExport(_id, data) {
      assert.ok(data.length <= 256 * 1024);
      chunks.push(Buffer.from(data, 'base64'));
      return true;
    },
    finishExport() {
      assert.equal(Buffer.concat(chunks).length, expected);
      completed = true;
      return true;
    },
    cancelExport() {
      assert.fail('successful write must not be cancelled');
    },
  };
  const bytes = Uint8Array.from({ length: 700000 }, (_, i) => i % 251);
  await saveBackupFile(new Blob([bytes]), '沐衣备份-2026-11-10-1of1.zip');
  assert.ok(completed);
  assert.deepEqual(new Uint8Array(Buffer.concat(chunks)), bytes);
});
test('native export cancellation is reported without sending image data', async () => {
  const target = platform();
  target.MoriFiles = {
    beginExport(id) {
      queueMicrotask(() =>
        target.dispatchEvent(
          new CustomEvent('mori-native-result', { detail: { id, ok: false, error: '已取消导出' } }),
        ),
      );
    },
    appendExport() {
      assert.fail('no write after cancellation');
    },
    finishExport() {
      return false;
    },
    cancelExport() {},
  };
  await assert.rejects(() => saveBackupFile(new Blob(['zip']), 'backup.zip'), /取消/);
});
test('partial native write failure closes the transfer instead of reporting success', async () => {
  const target = platform();
  let closed = false;
  target.MoriFiles = {
    beginExport(id) {
      queueMicrotask(() =>
        target.dispatchEvent(new CustomEvent('mori-native-result', { detail: { id, ok: true } })),
      );
    },
    appendExport() {
      return false;
    },
    finishExport() {
      assert.fail('failed transfer must not finish');
    },
    cancelExport() {
      closed = true;
    },
  };
  await assert.rejects(() => saveBackupFile(new Blob(['zip']), 'backup.zip'), /写入失败/);
  assert.ok(closed);
});
