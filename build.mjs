import * as esbuild from 'esbuild';
import { builtinModules } from 'node:module';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

/** 不把 Node 内置模块打进 bundle，否则 dotenv 等对 fs 的引用会变成错误的动态 import */
const nodeBuiltinsExternal = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

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

// 2. 打包 server.js 到 dist/server.js（npm 包不打进 bundle，避免 dotenv→fs 被错误打包）
await esbuild.build({
  entryPoints: ['server.js'],
  outfile: 'dist/server.js',
  format: 'esm',
  platform: 'node',
  bundle: true,
  packages: 'external',
  external: nodeBuiltinsExternal,
  sourcemap: false,
});

console.log('Build complete!');
