import vinext from 'vinext';
import { defineConfig } from 'vite';
import hostingConfig from './.openai/hosting.json';
import { readExecutionProfile } from './scripts/execution-profile.mjs';
import { configureToolEnvironment } from './scripts/tool-environment.mjs';
import { sites } from './scripts/vite/sites-vite-plugin';
import { connectorPreview } from './scripts/vite/connector-preview-plugin.mjs';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID = '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';
const managedLinux = readExecutionProfile() === 'managed-linux';

const localBindingConfig = {
  main: './worker/index.ts',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async ({ command }) => {
  configureToolEnvironment(process.cwd());
  // Node preview is for hosts where the native Workers simulator cannot run.
  // Production always builds with the real Cloudflare bindings.
  const nodePreview = command === 'serve' && process.env.MORI_NODE_PREVIEW === '1';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    resolve: nodePreview
      ? {
          alias: {
            'cloudflare:workers': new URL(
              './scripts/local-bindings.ts',
              import.meta.url,
            ).pathname.replace(/^\/(\w:)/, '$1'),
          },
        }
      : undefined,
    server: {
      ...(managedLinux ? { host: '0.0.0.0', allowedHosts: ['terminal.local'] } : {}),
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      vinext(),
      sites({ mockAuth: !managedLinux }),
      ...(nodePreview
        ? [
            {
              name: 'mori-viewport-qa',
              configureServer(server: any) {
                server.middlewares.use('/__qa/viewport', (request: any, response: any) => {
                  const p = new URL(request.url, 'http://localhost').searchParams;
                  const width = Math.max(320, Math.min(1600, Number(p.get('width')) || 390));
                  const path = ['/', '/upload', '/wardrobe'].includes(p.get('path') ?? '')
                    ? p.get('path')!
                    : '/';
                  response.setHeader('Content-Type', 'text/html; charset=utf-8');
                  response.end(
                    `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>沐衣 · ${width}px 布局检查</title><style>body{margin:0;background:#e7e2eb;font:12px system-ui;overflow-x:auto}p{text-align:center;color:#766280;margin:12px}iframe{border:1px solid #c9becf;display:block;margin:0 auto;width:${width}px;height:844px;background:#faf9f6}</style><p>${width}px CSS 视口 · 布局检查，不代表真机验收</p><iframe title="衣橱响应式预览" src="${path}"></iframe></html>`,
                  );
                });
              },
            },
          ]
        : []),
      ...(!nodePreview
        ? [
            connectorPreview(),
            cloudflare({
              viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
              inspectorPort: false,
              config: {
                ...localBindingConfig,
                ...(command === 'serve'
                  ? {
                      services: [
                        {
                          binding: 'CONNECTORS',
                          service: 'sites-connector-preview',
                          entrypoint: 'ConnectorPreview',
                        },
                      ],
                    }
                  : {}),
              },
              ...(command === 'serve'
                ? {
                    auxiliaryWorkers: [
                      {
                        config: {
                          name: 'sites-connector-preview',
                          main: './scripts/connector-preview/worker.mjs',
                          compatibility_date: '2026-05-15',
                        },
                      },
                    ],
                  }
                : {}),
            }),
          ]
        : []),
    ],
  };
});
