import { build } from 'esbuild';

const isProduction = process.argv.includes('--production');

await build({
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: ['node18'],
  outfile: './out/extension.js',
  external: ['vscode'],
  packages: 'external',
  sourcemap: !isProduction,
  minify: isProduction,
  format: 'cjs',
  logLevel: 'info',
});