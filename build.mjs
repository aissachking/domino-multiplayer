// بناء التطبيق إلى ملف HTML واحد مستقل (يعمل بلا إنترنت، ومناسب لـ PWA و Capacitor)
// الاستخدام: node build.mjs        بناء نهائي في dist/
//            node build.mjs --dev  بناء مع مراقبة التغييرات وخادم محلي على المنفذ 5173
import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const dev = process.argv.includes('--dev');
const extra = (process.env.EXTRA_NODE_PATH || '').split(':').filter(Boolean);

const FONTS =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Reem+Kufi:wght@500;700&display=swap';
const TITLE = 'تشكيلة';
const DESC = 'شكّل فريقين متوازنين لكرة القدم على ملعب ثلاثي الأبعاد، ثم صدّر التشكيلة صورة.';

const esc = (s) => s.replace(/<\/(script|style)/gi, '<\\/$1');

function pages(js, css) {
  const head = `<title>${TITLE}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="${DESC}">
<meta name="theme-color" content="#070B0A">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${esc(css)}</style>`;
  const body = `<div id="root"></div>
<script>${esc(js)}</script>`;
  const full = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
${head}
</head>
<body>
${body}
</body>
</html>
`;
  // نسخة للنشر كصفحة مستضافة: بلا وسوم html/head/body
  const fragment = `${head}
<script>document.documentElement.lang='ar';document.documentElement.dir='rtl';</script>
${body}
`;
  return { full, fragment };
}

const writeHtml = {
  name: 'write-html',
  setup(build) {
    build.onEnd((res) => {
      if (res.errors.length) return;
      const js = res.outputFiles.find((f) => f.path.endsWith('.js'))?.text ?? '';
      const css = res.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
      mkdirSync(dist, { recursive: true });
      if (existsSync(join(root, 'public'))) cpSync(join(root, 'public'), dist, { recursive: true });
      const { full, fragment } = pages(js, css);
      writeFileSync(join(dist, 'index.html'), full);
      writeFileSync(join(dist, 'artifact.html'), fragment);
      console.log(`✓ dist/index.html  ${(full.length / 1024).toFixed(0)} KB`);
    });
  },
};

const options = {
  entryPoints: [join(root, 'src/main.tsx')],
  bundle: true,
  outdir: dist,
  write: false,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  minify: !dev,
  sourcemap: false,
  legalComments: 'none',
  nodePaths: [join(root, 'node_modules'), ...extra],
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
  plugins: [writeHtml],
  logLevel: 'warning',
};

if (dev) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: dist, port: 5173 });
  console.log(`تشكيلة يعمل على http://localhost:${port}`);
} else {
  await esbuild.build(options);
}
