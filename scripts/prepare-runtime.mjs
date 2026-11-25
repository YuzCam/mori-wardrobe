import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
await mkdir('public/ort', { recursive: true });
for (const file of [
  'ort.wasm.min.mjs',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
])
  await copyFile(
    path.join('node_modules/onnxruntime-web/dist', file),
    path.join('public/ort', file),
  );
await mkdir('public/workers', { recursive: true });
const source = await readFile('workers/image-processing.worker.ts', 'utf8');
const result = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
await writeFile('public/workers/image-processing.js', result.outputText);
console.log('Browser inference runtime copied from the locked ONNX Runtime version.');
