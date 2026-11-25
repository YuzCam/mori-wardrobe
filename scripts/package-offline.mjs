import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { zip } from 'fflate';
import ts from 'typescript';
const files = {};
async function walk(directory, prefix) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      [
        '.hvigor',
        '.idea',
        'oh_modules',
        'node_modules',
        'build',
        'signing',
        'local.properties',
      ].includes(entry.name) ||
      /\.(p12|cer|p7b|pem|csr|key|keystore)$/i.test(entry.name)
    )
      continue;
    const full = path.join(directory, entry.name),
      name = prefix + '/' + entry.name;
    if (entry.isDirectory()) await walk(full, name);
    else if (name === 'MoriOffline/build-profile.json5') {
      // DevEco writes local certificate paths and encrypted passwords here.
      // Keep the working project signed, but remove all signing material from exports.
      const result = ts.parseConfigFileTextToJson(full, await readFile(full, 'utf8'));
      if (result.error || !result.config.app) throw new Error('Cannot safely export build profile');
      result.config.app.signingConfigs = [];
      for (const product of result.config.app.products ?? []) delete product.signingConfig;
      files[name] = new TextEncoder().encode(JSON.stringify(result.config, null, 2));
    } else files[name] = new Uint8Array(await readFile(full));
  }
}
await readFile('outputs/offline-build.json');
await walk('harmonyos', 'MoriOffline');
const zipped = await new Promise((resolve, reject) =>
  zip(files, { level: 6 }, (error, result) => (error ? reject(error) : resolve(result))),
);
await mkdir('outputs', { recursive: true });
const target = path.resolve('outputs/MoriOffline-HarmonyOS-project.zip');
await writeFile(target, zipped);
console.log(target);
console.log('This is a source project archive, not an installable HAP.');
