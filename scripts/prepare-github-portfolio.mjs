import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, copyFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';

const root = process.cwd();
const destination = path.resolve(root, '../github-publication-20261125');
const project = path.join(destination, 'mori-wardrobe');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8', windowsHide: true,
}).trim().split(/\r?\n/);
const excluded = /^(?:\.openai\/|\.env|outputs\/|work\/|docs\/portfolio\/|public\/models\/|public\/ort\/(?!LICENSE\.txt$))|(?:^|\/)(?:node_modules|oh_modules|build|\.hvigor|\.idea|signing)(?:\/|$)|\.(?:p12|p7b|cer|pem|key|keystore|hap|hsp|db|sqlite|zip|log|tsbuildinfo)$/i;
const allowed = /^(?:app|components|config|db|docs|drizzle|examples|features|hooks|lib|public|scripts|tests|types|vendor|worker|workers|offline|harmonyos)\/|^[\w.-]+$/;
await mkdir(project, { recursive: true });
for (const name of files) {
  if (!allowed.test(name) || excluded.test(name) || name === 'harmonyos/build-profile.json5' || name.endsWith('local.properties')) continue;
  const target = path.join(project, name);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(root, name), target);
}
await mkdir(path.join(project, 'docs/images'), { recursive: true });
await mkdir(path.join(project, '.openai'), { recursive: true });
await writeFile(path.join(project, '.openai/hosting.json'), JSON.stringify({ d1: 'DB', r2: 'BUCKET' }, null, 2));
await mkdir(path.join(project, '.github/workflows'), { recursive: true });
await copyFile(path.join(root, 'docs/portfolio/checks.yml'), path.join(project, '.github/workflows/checks.yml'));
await copyFile(path.join(root, 'README.md'), path.join(project, 'docs/web-prototype.md'));
await copyFile(path.join(root, 'docs/portfolio/README.md'), path.join(project, 'README.md'));
await copyFile(path.join(root, 'docs/portfolio/case-study.md'), path.join(project, 'docs/case-study.md'));
await copyFile(path.join(root, 'outputs/v020-outfit-preview.png'), path.join(project, 'docs/images/outfits.png'));
await copyFile(path.join(root, 'outputs/v021-storage-preview.png'), path.join(project, 'docs/images/storage.png'));
await mkdir(path.join(destination, 'YuzCam'), { recursive: true });
await copyFile(path.join(root, 'docs/portfolio/profile.md'), path.join(destination, 'YuzCam/README.md'));
// Retain placeholders needed by native build tooling without local signing material.
await copyFile(path.join(root, 'harmonyos/entry/build-profile.json5'), path.join(project, 'harmonyos/entry/build-profile.json5'));
await writeFile(path.join(project, '.gitignore'), (await readFile(path.join(root, '.gitignore'), 'utf8')) + '\n/public/models/\n/public/ort/*.mjs\n/public/ort/*.wasm\n');
const archive = {}, manifest = [];
async function inspect(folder) {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    if (['node_modules', '.git', 'outputs', 'work'].includes(item.name) || item.name.endsWith('.tsbuildinfo')) continue;
    const full = path.join(folder, item.name);
    if (item.isDirectory()) { await inspect(full); continue; }
    const name = path.relative(project, full).replaceAll('\\', '/');
    if (/\.(?:p12|p7b|cer|pem|key|keystore|hap|db|sqlite)$/i.test(name) || name === 'harmonyos/build-profile.json5')
      throw new Error('Private artifact in export: ' + name);
    const bytes = await readFile(full);
    if (!/\.(?:png|jpg|jpeg|webp)$/i.test(name)) {
      const text = bytes.toString('utf8');
      const secret = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}|"(?:keyPassword|keystorePassword)"\s*:\s*"[^"]+"/;
      if (secret.test(text)) throw new Error('Possible credential in export: ' + name);
    }
    archive['mori-wardrobe/' + name] = bytes;
    manifest.push({ path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
}
await inspect(project);
await writeFile(path.join(destination, 'mori-wardrobe-source.zip'), zipSync(archive));
await writeFile(path.join(destination, 'publication-manifest.json'), JSON.stringify({
  owner: 'YuzCam', preparedAt: new Date().toISOString(), projectRepository: 'mori-wardrobe',
  profileRepository: 'YuzCam', published: false, fileCount: manifest.length, files: manifest,
}, null, 2));
console.log(JSON.stringify({ destination, files: manifest.length,
  archiveBytes: (await stat(path.join(destination, 'mori-wardrobe-source.zip'))).size,
  userPhotosIncluded: false, signingMaterialsIncluded: false, published: false }, null, 2));
