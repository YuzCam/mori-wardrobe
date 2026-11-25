/** Prepare licensed pinned local models. Add --mirror for the SHA-checked hf-mirror.com transport. */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = path.join(root, 'work', 'model-assets');
const clipDir = path.join(work, 'clip-vit-base-patch32');
const publicModels = path.join(root, 'public', 'models');
const metadataDir = path.join(root, 'public', 'model-metadata');
const revision = '6b7c523703ae26e39be4b03774966f8571c7f523';
const clipBase = `https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/${revision}`;
const shardSize = 16 * 1024 * 1024;
const sources = {
  segmentation: {
    path: path.join(work, 'u2netp.onnx'),
    url: 'https://huggingface.co/tomjackson2023/rembg/resolve/cd3a3d6767a7859efea31ef0f2f373582cf06d82/u2netp.onnx',
    sha256: '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
  },
  classification: {
    path: path.join(clipDir, 'onnx', 'vision_model_quantized.onnx'),
    url: `${clipBase}/onnx/vision_model_quantized.onnx`,
    sha256: '583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299',
  },
  text: {
    path: path.join(clipDir, 'onnx', 'text_model_quantized.onnx'),
    url: `${clipBase}/onnx/text_model_quantized.onnx`,
    sha256: '73baab855d406190da9faa498cfedf65f15cf309f4cc7385b7b032e6d08e5c3a',
  },
};

async function digest(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function download(item) {
  await mkdir(path.dirname(item.path), { recursive: true });
  try {
    if ((await stat(item.path)).size > 0 && (!item.sha256 || await digest(item.path) === item.sha256)) return;
  } catch { /* Missing files are downloaded below. */ }
  if (process.argv.includes('--skip-download')) throw new Error(`Missing or invalid model file: ${item.path}`);
  const temporary = `${item.path}.partial`;
  console.log(`Downloading ${path.basename(item.path)}`);
  const transport = new URL(item.url);
  if (process.argv.includes('--mirror') && transport.hostname === 'huggingface.co') transport.hostname = 'hf-mirror.com';
  const response = await fetch(transport, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`${response.status} downloading ${item.url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(temporary, bytes);
  if (item.sha256 && await digest(temporary) !== item.sha256) {
    await unlink(temporary);
    throw new Error(`SHA-256 mismatch: ${item.url}`);
  }
  await rename(temporary, item.path);
  console.log(`Verified ${path.basename(item.path)} (${bytes.byteLength} bytes)`);
}

async function shards(source, stem) {
  const bytes = await readFile(source.path);
  const files = [];
  const segments = [];
  for (let offset = 0, index = 0; offset < bytes.byteLength; offset += shardSize, index++) {
    const part = bytes.subarray(offset, Math.min(offset + shardSize, bytes.byteLength));
    const name = `${stem}.${String(index).padStart(3, '0')}.bin`;
    await writeFile(path.join(publicModels, name), part);
    const url = `/models/${name}`;
    files.push(url);
    segments.push({ url, bytes: part.byteLength, sha256: createHash('sha256').update(part).digest('hex') });
  }
  return { files, segments, bytes: bytes.byteLength, sha256: source.sha256 };
}

await Promise.all([mkdir(work, { recursive: true }), mkdir(publicModels, { recursive: true }), mkdir(metadataDir, { recursive: true })]);
await Promise.all([
  ...Object.values(sources).map(download),
  ...['config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'merges.txt', 'vocab.json'].map(name => download({ path: path.join(clipDir, name), url: `${clipBase}/${name}` })),
]);

// Use the browser tokenizer bundle and the exact browser inference backend. This
// avoids optional native DLLs and verifies that the shipped graphs run in WASM.
const transformersEntry = fileURLToPath(import.meta.resolve('@huggingface/transformers'));
const ort = await import('onnxruntime-web');
ort.env.wasm.numThreads = 1;
globalThis[Symbol.for('onnxruntime')] = ort;
const { CLIPTokenizer } = await import(pathToFileURL(path.join(path.dirname(transformersEntry), 'transformers.web.js')).href);
ort.env.wasm.wasmPaths = pathToFileURL(`${path.dirname(fileURLToPath(import.meta.resolve('onnxruntime-web')))}${path.sep}`).href;
const checks = [];

console.log('Checking segmentation model with actual ONNX inference');
let start = performance.now();
const segmentation = await ort.InferenceSession.create(new Uint8Array(await readFile(sources.segmentation.path)), { executionProviders: ['wasm'] });
const segmentationInput = segmentation.inputNames[0];
const segmentationOutput = segmentation.outputNames[0];
const mask = await segmentation.run({ [segmentationInput]: new ort.Tensor('float32', new Float32Array(3 * 320 * 320), [1, 3, 320, 320]) });
if (Array.from(mask[segmentationOutput].data).some(value => !Number.isFinite(value))) throw new Error('Segmentation returned nonfinite values');
checks.push({ model: 'u2netp', input: segmentationInput, outputs: Object.fromEntries(Object.entries(mask).map(([name, tensor]) => [name, { dims: tensor.dims, type: tensor.type }])), elapsedMs: Math.round(performance.now() - start) });
if (mask[segmentationOutput].dims.join(',') !== '1,1,320,320') throw new Error('Unexpected segmentation output shape');
await segmentation.release();

console.log('Computing real normalized category/style/season text embeddings');
const taxonomy = await import(pathToFileURL(path.join(root, 'config', 'taxonomy.ts')).href);
const seasonPrompts = { summer: 'lightweight summer clothing for hot weather', winter: 'warm winter clothing for cold weather' };
const groups = { categories: taxonomy.categories, styles: taxonomy.styles, seasons: taxonomy.seasons.map(item => ({ ...item, prompt: seasonPrompts[item.id] })) };
const ordered = [...groups.categories, ...groups.styles, ...groups.seasons];
const prompts = ordered.map(item => `a photo of ${item.prompt}`);
const tokenizer = new CLIPTokenizer(JSON.parse(await readFile(path.join(clipDir, 'tokenizer.json'), 'utf8')), JSON.parse(await readFile(path.join(clipDir, 'tokenizer_config.json'), 'utf8')));
const textModel = await ort.InferenceSession.create(new Uint8Array(await readFile(sources.text.path)), { executionProviders: ['wasm'] });
start = performance.now();
const textInputs = tokenizer(prompts, { padding: true, truncation: true });
const textFeeds = Object.fromEntries(textModel.inputNames.map(name => [name, new ort.Tensor(textInputs[name].type, textInputs[name].data, textInputs[name].dims)]));
const { text_embeds } = await textModel.run(textFeeds);
if (text_embeds.dims[0] !== ordered.length || text_embeds.dims[1] !== 512) throw new Error(`Unexpected text embedding shape ${text_embeds.dims}`);
const vectors = ordered.map((item, index) => {
  const embedding = Array.from(text_embeds.data.slice(index * 512, (index + 1) * 512));
  const norm = Math.hypot(...embedding);
  if (!Number.isFinite(norm) || norm <= 0) throw new Error(`Invalid embedding for ${item.id}`);
  return { id: item.id, name: item.name, prompt: prompts[index], embedding: embedding.map(x => x / norm) };
});
const styleEnd = groups.categories.length + groups.styles.length;
const labels = { version: 1, model: 'Xenova/clip-vit-base-patch32', revision, dimensions: 512, normalized: true, categories: vectors.slice(0, groups.categories.length), styles: vectors.slice(groups.categories.length, styleEnd), seasons: vectors.slice(styleEnd) };
checks.push({ model: 'clip-text-q8', output: 'text_embeds', dims: text_embeds.dims, elapsedMs: Math.round(performance.now() - start), normalizedVectorCount: vectors.length });
await textModel.release();

console.log('Checking classification model with actual ONNX inference');
start = performance.now();
const session = await ort.InferenceSession.create(new Uint8Array(await readFile(sources.classification.path)), { executionProviders: ['wasm'] });
const visionInput = session.inputNames.find(name => name === 'pixel_values');
if (!visionInput) throw new Error('Unexpected CLIP input name');
const image = await session.run({ [visionInput]: new ort.Tensor('float32', new Float32Array(3 * 224 * 224), [1, 3, 224, 224]) });
if (!image.image_embeds || image.image_embeds.dims.join(',') !== '1,512') throw new Error('Unexpected CLIP image embedding shape');
if (Array.from(image.image_embeds.data).some(value => !Number.isFinite(value))) throw new Error('CLIP returned nonfinite values');
checks.push({ model: 'clip-vision-q8', inputs: session.inputNames, outputs: Object.fromEntries(Object.entries(image).filter(([, value]) => value?.dims).map(([name, tensor]) => [name, { dims: tensor.dims, type: tensor.type }])), elapsedMs: Math.round(performance.now() - start) });
await session.release();

const manifest = {
  version: 1,
  segmentation: { ...await shards(sources.segmentation, 'u2netp.onnx'), model: 'u2netp', license: 'Apache-2.0', source: sources.segmentation.url, input: segmentationInput, output: segmentationOutput, inputShape: [1, 3, 320, 320], outputShape: [1, 1, 320, 320], preprocessing: { resize: 'stretch', channelOrder: 'RGB', scale: 'divide-by-image-maximum', mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] } },
  classification: { ...await shards(sources.classification, 'clip-vision-q8.onnx'), model: 'Xenova/clip-vit-base-patch32', revision, license: 'MIT', source: sources.classification.url, input: visionInput, output: 'image_embeds', inputShape: [1, 3, 224, 224], outputShape: [1, 512], preprocessing: { resize: 'shortest-edge-224', crop: 'center-224', channelOrder: 'RGB', scale: 1 / 255, mean: [0.48145466, 0.4578275, 0.40821073], std: [0.26862954, 0.26130258, 0.27577711] } },
};
const mitLicense = `MIT License

Copyright (c) 2021 OpenAI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
const apacheLicense = await readFile(path.join(path.dirname(transformersEntry), '..', 'LICENSE'), 'utf8');
await Promise.all([
  writeFile(path.join(metadataDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
  writeFile(path.join(metadataDir, 'labels.json'), `${JSON.stringify(labels)}\n`),
  writeFile(path.join(work, 'validation.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), checks }, null, 2)}\n`),
  writeFile(path.join(metadataDir, 'APACHE-2.0.txt'), apacheLicense),
  writeFile(path.join(metadataDir, 'CLIP-MIT.txt'), mitLicense),
  writeFile(path.join(metadataDir, 'NOTICE.txt'), 'U²-Net: Going Deeper with Nested U-Structure for Salient Object Detection. Xuebin Qin, Zichen Zhang, Chenyang Huang, Masood Dehghan, Osmar R. Zaiane, Martin Jagersand, Pattern Recognition 106 (2020), 107404. Upstream https://github.com/xuebinqin/U-2-Net (Apache-2.0). ONNX distribution https://github.com/danielgatis/rembg (MIT).\nCLIP model Copyright (c) 2021 OpenAI (MIT), https://github.com/openai/CLIP. ONNX conversion distributed by Xenova at https://huggingface.co/Xenova/clip-vit-base-patch32 (MIT).\nModel weights are unchanged. ONNX files are split into ordered transport segments only; concatenation restores the upstream file byte for byte. Label vectors were generated from the project taxonomy using the pinned CLIP text encoder, then L2 normalized.\n'),
]);
console.log(JSON.stringify({ ready: true, files: manifest.segmentation.files.concat(manifest.classification.files), labelCount: vectors.length, checks }, null, 2));
