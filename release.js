import path from 'path';
import { fileURLToPath } from 'url';
import { run_core_release } from '../obsidian-smart-env/build/release_runner.js';

const is_main = path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);

if (is_main) {
  run_core_release().catch((err) => {
    console.error('Error in release process:', err);
    process.exit(1);
  });
}
