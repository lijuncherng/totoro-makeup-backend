import * as esbuild from 'esbuild';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. 把 src/ 编译到 dist/（不含 server.js）
await esbuild.build({
  entryPoints: [
    'src/index.ts',
    'src/routes/auth.ts',
    'src/routes/consumption.ts',
    'src/routes/makeup.ts',
    'src/routes/recharge.ts',
    'src/routes/tasks.ts',
    'src/worker.ts',
    'src/utils/cardGenerator.ts',
    'src/db/supabase.ts',
    'src/services/encryption.ts',
    'src/services/executor.ts',
    'src/services/totoro.ts',
  ],
  outdir: 'dist',
  format: 'esm',
  platform: 'node',
  sourcemap: false,
  bundle: false,
});

// 2. 打包 server.js 到 dist/server.js
await esbuild.build({
  entryPoints: ['server.js'],
  outfile: 'dist/server.js',
  format: 'esm',
  platform: 'node',
  bundle: true,
  external: [],
  sourcemap: false,
});

console.log('Build complete!');
