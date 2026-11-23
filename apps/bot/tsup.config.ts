import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  // Workspace packages ship TypeScript sources, so bundle them in.
  noExternal: [/^@yh\//],
});
