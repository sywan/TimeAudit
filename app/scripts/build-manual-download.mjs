import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(app, 'public');
const files = {
  'logo-v108.svg': 'image/svg+xml',
  'time-audit-logo-4096.png': 'image/png',
  'USER-MANUAL.md': 'text/markdown;charset=utf-8',
  'USER-MANUAL.en.md': 'text/markdown;charset=utf-8',
  'USER-MANUAL.zh-TW.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'USER-MANUAL.en.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'USER-MANUAL.zh-TW.pdf': 'application/pdf',
  'USER-MANUAL.en.pdf': 'application/pdf',
};
const embedded = Object.fromEntries(Object.entries(files).map(([name, mime]) => [name, `data:${mime};base64,${readFileSync(join(publicDir, name)).toString('base64')}`]));
const result = await build({
  absWorkingDir: app,
  entryPoints: ['src/manual.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  minify: true,
  define: { 'import.meta.env.BASE_URL': '"./"' },
  outdir: 'standalone',
  write: false,
});
const js = result.outputFiles.find(file => file.path.endsWith('.js'))?.text;
let css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text;
if (!js || !css) throw new Error('The React manual did not produce both JavaScript and CSS.');
css = css.replace(/@import\s+url\([^;]+;\s*/g, '');
const title = 'Time Audit · 離線使用手冊 / Offline User Guide';
const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css.replaceAll('</style', '<\\/style')}</style></head><body><div id="root"></div><script>window.__TA_OFFLINE_ASSETS__=${JSON.stringify(embedded)};</script><script>${js.replaceAll('</script', '<\\/script')}</script></body></html>`;
const htmlPath = join(publicDir, 'Time-Audit-Manual-Offline.html');
writeFileSync(htmlPath, html);
execFileSync('zip', ['-q', '-j', '-X', '-o', join(publicDir, 'Time-Audit-Downloads.zip'), htmlPath, join(publicDir, 'time-audit-logo-4096.png'), join(publicDir, 'QR-CODE_TimeAudit.png'), ...['USER-MANUAL.md', 'USER-MANUAL.en.md', 'USER-MANUAL.zh-TW.docx', 'USER-MANUAL.en.docx', 'USER-MANUAL.zh-TW.pdf', 'USER-MANUAL.en.pdf'].map(name => join(publicDir, name))]);
console.log('Built offline React manual and download archive.');
