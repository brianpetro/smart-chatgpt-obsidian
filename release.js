import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import archiver from 'archiver';
import axios from 'axios';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { remove_existing_release_and_tag } from '../obsidian-smart-env/build/github_release_utils.js';
import {
  build_combined_notes,
  latest_release_file,
  parse_cli_options,
  write_plugin_release_notes,
} from '../obsidian-smart-env/build/release_notes.js';

const is_main = path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);

if (is_main) {
  run_release().catch((err) => {
    console.error('Error in release process:', err);
    process.exit(1);
  });
}

async function run_release() {
  const cli_options = parse_cli_options(process.argv.slice(2));

  const package_json = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  const manifest_json = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
  const version = package_json.version;
  const manifest_id = manifest_json.id;

  if (version !== manifest_json.version) {
    console.error('Version mismatch between package.json and manifest.json');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

  const confirmed_version = (await ask(`Confirm release version (${version}): `))?.trim() || version;
  console.log(`Creating release for ${confirmed_version}`);

  const releases_dir = './releases';
  const release_file = path.join(releases_dir, `${confirmed_version}.md`);
  let version_notes = '';
  let user_desc = '';

  if (fs.existsSync(release_file)) {
    version_notes = fs.readFileSync(release_file, 'utf8').trim();
  } else {
    const prior_file = latest_release_file(releases_dir, confirmed_version);
    let prior_notes = prior_file ? fs.readFileSync(prior_file, 'utf8').trim() : '';

    if (prior_notes.includes('## next patch')) {
      prior_notes = prior_notes.replace('## next patch', `## patch \`v${confirmed_version}\`\n`);
      version_notes = prior_notes;
    } else {
      user_desc = await ask('Enter additional release description (optional): ');
      version_notes = build_combined_notes(confirmed_version, prior_notes, user_desc);
    }

    if (prior_file) {
      fs.writeFileSync(prior_file, version_notes);
    } else {
      fs.mkdirSync(releases_dir, { recursive: true });
      fs.writeFileSync(release_file, version_notes);
    }
  }

  const target_file = fs.existsSync(release_file)
    ? release_file
    : latest_release_file(releases_dir, confirmed_version);

  if (target_file) {
    write_plugin_release_notes({
      release_path: target_file,
      output_path: './releases/latest_release.md',
      version: confirmed_version,
    });
  } else {
    console.warn('No release notes file found to format into latest_release.md');
  }

  rl.close();
  await new Promise((resolve) => setTimeout(resolve, 500));

  await new Promise((resolve, reject) => {
    exec('npm run build', (err, stdout) => {
      if (err) reject(err);
      if (stdout) console.log(stdout);
      console.log('build finished');
      resolve();
    });
  });

  const github_token = process.env.GH_TOKEN;
  const github_repo = process.env.GH_REPO;
  if (!github_token || !github_repo) {
    console.error('GH_TOKEN or GH_REPO missing from .env');
    process.exit(1);
  }

  if (cli_options.replace_existing) {
    console.log(
      `--replace-existing set; removing any existing release and tag for ${confirmed_version}`,
    );
    await remove_existing_release_and_tag({
      github_repo,
      github_token,
      tag_name: confirmed_version,
    });
  }

  const release_data = {
    tag_name: confirmed_version,
    name: confirmed_version,
    body: version_notes,
    draft: cli_options.draft,
    prerelease: false,
  };
  const release_resp = await axios.post(
    `https://api.github.com/repos/${github_repo}/releases`,
    release_data,
    { headers: { Authorization: `Bearer ${github_token}`, 'Content-Type': 'application/json' } },
  );
  const { upload_url, html_url } = release_resp.data;
  console.log('Release created:', html_url);

  const upload_asset_curl = (asset_path, asset_name) =>
    new Promise((resolve, reject) => {
      const url = `${upload_url.split('{')[0]}?name=${encodeURIComponent(asset_name)}`;
      const cmd = [
        'curl',
        '-X', 'POST',
        '-H', `"Authorization: Bearer ${github_token}"`,
        '-H', '"Content-Type: application/octet-stream"',
        '--data-binary', `@${asset_path}`,
        `"${url}"`,
      ].join(' ');
      exec(cmd, (err, stdout, stderr) => {
        if (err) return reject(err);
        if (stdout) console.log(stdout);
        if (stderr) console.log(stderr);
        console.log(`Uploaded ${asset_name}`);
        resolve();
      });
    });

  const zip_name = `${manifest_id}-${confirmed_version}.zip`;
  const zip_stream = fs.createWriteStream(`./${zip_name}`);
  const archive = archiver('zip', { zlib: { level: 0 } });

  await new Promise((resolve, reject) => {
    archive.pipe(zip_stream);
    archive.directory('dist/', false);
    archive.on('error', reject);
    zip_stream.on('close', resolve);
    archive.finalize();
  });
  console.log(`Archive wrote ${archive.pointer()} bytes`);
  await upload_asset_curl(`./${zip_name}`, zip_name);

  for (const file of fs.readdirSync('./dist')) {
    await upload_asset_curl(`./dist/${file}`, file);
  }

  setTimeout(() => fs.unlinkSync(`./${zip_name}`), 3000);
}
