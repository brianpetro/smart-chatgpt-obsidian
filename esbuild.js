import esbuild from 'esbuild';
import 'dotenv/config';
import { build_plugin } from 'obsidian-smart-env/build/build_plugin.js';

build_plugin({
  esbuild,
  entry_point: 'src/main.js',
  entry_point_from_argv: true,
  external: [
    '@huggingface/transformers',
  ],
  plugin_id: 'smart-chatgpt',
  minify_from_argv: true,
}).catch((err) => {
  console.error('Error in build process:', err);
  process.exit(1);
});
