// بعض منصات الاستضافة تثبّت الحزم دون الاعتماديات الاختيارية، فيغيب ملف esbuild التنفيذي.
// هذا السكربت يتحقق منه ويثبّت النسخة المناسبة للنظام عند الحاجة فقط.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
try {
  require('esbuild').transformSync('let a = 1');
} catch {
  const { version } = require('esbuild/package.json');
  const pkg = `@esbuild/${process.platform}-${process.arch}@${version}`;
  console.log(`تثبيت ${pkg}…`);
  execSync(`npm install --no-save --no-audit --no-fund ${pkg}`, { stdio: 'inherit' });
}
