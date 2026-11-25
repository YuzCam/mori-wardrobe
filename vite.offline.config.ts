import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const csp =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
export default defineConfig({
  root: 'offline',
  publicDir: false,
  base: '/',
  plugins: [
    react(),
    {
      name: 'offline-local-assets',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
          if (pathname === '/__qa/phone') {
            const width = Math.max(
              320,
              Math.min(
                1600,
                Number(new URL(request.url!, 'http://localhost').searchParams.get('width')) || 390,
              ),
            );
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(
              `<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>沐衣 · ${width}px 窄屏检查</title><style>body{margin:0;background:#e9e5ed;color:#86768e;font:11px system-ui}p{margin:10px;text-align:center}iframe{display:block;margin:auto;border:1px solid #cfc4d6;width:${width}px;height:890px;background:#f7f5f1}</style><p>${width}px 窄屏预览 · 不代表鸿蒙真机验收</p><iframe title="离线衣橱窄屏预览" src="/"></iframe></html>`,
            );
            return;
          }
          if (
            !/^\/(models|model-metadata|ort|workers)\/[\w.\/-]+$/.test(pathname) ||
            pathname.includes('..')
          )
            return next();
          const target = path.join(process.cwd(), 'public', pathname);
          if (!existsSync(target)) return next();
          const mime = target.endsWith('.json')
            ? 'application/json'
            : /\.(mjs|js)$/.test(target)
              ? 'text/javascript'
              : target.endsWith('.wasm')
                ? 'application/wasm'
                : 'application/octet-stream';
          response.setHeader('Content-Type', mime);
          response.setHeader('Content-Length', statSync(target).size);
          createReadStream(target).pipe(response);
        });
      },
    },
    {
      name: 'offline-content-policy',
      apply: 'build',
      transformIndexHtml: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
          injectTo: 'head-prepend',
        },
      ],
    },
  ],
  server: { host: '127.0.0.1', port: 5180, strictPort: true },
  build: {
    outDir: '../outputs/offline-web',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
});
