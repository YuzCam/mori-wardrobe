const runtimeUrl = '/ort/ort.wasm.min.mjs';
const ort = await import(/* @vite-ignore */ runtimeUrl);
ort.env.wasm.wasmPaths = '/ort/';
ort.env.wasm.numThreads = 1;
ort.env.logLevel = 'error';
const report = (stage, loaded, total) => self.postMessage({ type: 'progress', progress: { stage, loaded, total } });
async function download(files, stage, expectedTotal, offline = false) {
    const parts = [];
    let loaded = 0;
    let total = 0;
    const cache = !offline && typeof caches !== 'undefined' ? await caches.open('mori-models-v1').catch(() => null) : null;
    for (const file of files) {
        let response = await cache?.match(file);
        if (!response) {
            response = await fetch(file);
            if (!response.ok)
                throw new Error('模型资源暂时不可用，请稍后重试');
            if (cache)
                await cache.put(file, response.clone()).catch(() => { });
        }
        const size = Number(response.headers.get('content-length'));
        total += size || 0;
        const reader = response.body?.getReader();
        if (!reader) {
            const bytes = new Uint8Array(await response.arrayBuffer());
            parts.push(bytes);
            loaded += bytes.length;
            continue;
        }
        while (true) {
            const chunk = await reader.read();
            if (chunk.done)
                break;
            parts.push(chunk.value);
            loaded += chunk.value.length;
            report(stage, loaded, expectedTotal || (files.length === 1 ? total : undefined));
        }
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const p of parts) {
        bytes.set(p, offset);
        offset += p.length;
    }
    return bytes;
}
function tensor(pixels, size, mean, std, saliency = false) {
    const area = size * size;
    const out = new Float32Array(area * 3);
    let max = 255;
    if (saliency) {
        max = 1;
        for (let i = 0; i < pixels.length; i += 4)
            for (let c = 0; c < 3; c++)
                max = Math.max(max, pixels[i + c]);
    }
    for (let i = 0; i < area; i++)
        for (let c = 0; c < 3; c++)
            out[c * area + i] = (pixels[i * 4 + c] / max - mean[c]) / std[c];
    return new ort.Tensor('float32', out, [1, 3, size, size]);
}
self.onmessage = async (event) => {
    let session;
    try {
        const { type, pixels, offline = false } = event.data;
        const manifestResponse = await fetch('/model-metadata/manifest.json');
        if (!manifestResponse.ok)
            throw new Error('模型尚未准备好，请稍后重试');
        const manifest = await manifestResponse.json();
        const info = type === 'segment' ? manifest.segmentation : manifest.classification;
        report(offline ? '正在读取内置模型' : type === 'segment' ? '加载抠图模型' : '加载分类模型（首次约 85 MB）');
        const bytes = await download(info.files, offline ? '正在读取内置模型' : type === 'segment' ? '下载抠图模型' : '下载分类模型', info.bytes, offline);
        if (info.sha256 && crypto.subtle) {
            const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
                .map((v) => v.toString(16).padStart(2, '0'))
                .join('');
            if (hash !== info.sha256)
                throw new Error('模型文件校验失败，请清理模型缓存后重试');
        }
        report('正在准备本地识别');
        session = await ort.InferenceSession.create(bytes, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all',
        });
        const input = type === 'segment'
            ? tensor(pixels, 320, [0.485, 0.456, 0.406], [0.229, 0.224, 0.225], true)
            : tensor(pixels, 224, [0.48145466, 0.4578275, 0.40821073], [0.26862954, 0.26130258, 0.27577711]);
        report(type === 'segment' ? '正在提取衣物主体' : '正在识别品类与风格');
        const output = await session.run({ [info.input || session.inputNames[0]]: input });
        const data = output[info.output || session.outputNames[0]].data;
        if (type === 'segment') {
            let min = Infinity, max = -Infinity;
            for (const x of data) {
                min = Math.min(min, x);
                max = Math.max(max, x);
            }
            const mask = new Float32Array(320 * 320);
            for (let i = 0; i < mask.length; i++)
                mask[i] = (data[i] - min) / Math.max(0.000001, max - min);
            self.postMessage({ type: 'result', result: mask }, { transfer: [mask.buffer] });
        }
        else {
            const labels = await (await fetch('/model-metadata/labels.json')).json();
            const norm = Math.sqrt(data.reduce((v, x) => v + x * x, 0));
            const rank = (entries) => entries
                .map((e) => ({
                label: e.id,
                score: e.embedding.reduce((v, x, i) => v + x * (data[i] / norm), 0),
            }))
                .sort((a, b) => b.score - a.score);
            self.postMessage({
                type: 'result',
                result: {
                    categories: rank(labels.categories).slice(0, 3),
                    styles: rank(labels.styles).slice(0, 3),
                    seasons: rank(labels.seasons ?? []),
                },
            });
        }
    }
    catch (error) {
        self.postMessage({
            type: 'error',
            error: error instanceof Error ? error.message : '识别失败，请重试',
        });
    }
    finally {
        await session?.release();
    }
};
self.postMessage({ type: 'ready' });
export {};
