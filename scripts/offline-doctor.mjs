import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const roots = [
  process.env.MORI_HARMONY_TOOLS,
  process.env.DEVECO_STUDIO_HOME,
  'C:/Program Files/Huawei/DevEco Studio',
  'D:/DevEco Studio',
  'D:/Huawei/DevEco Studio',
  'D:/Huawei/DevEcoStudio',
].filter(Boolean);
let found = false;
let bundledJava;
for (const root of roots) {
  const options = [
    'bin/hvigorw.bat',
    'bin/hvigorw.cmd',
    'tools/hvigor/bin/hvigorw.js',
    'hvigor/bin/hvigorw.js',
  ];
  for (const option of options)
    if (existsSync(path.join(root, option))) {
      console.log('BUILD_TOOL_FOUND ' + path.join(root, option));
      found = true;
      const javaPath = path.join(root, 'jbr/bin/java.exe');
      if (existsSync(javaPath)) bundledJava = javaPath;
    }
}
const java = spawnSync(bundledJava ?? 'java', ['-version'], { encoding: 'utf8', windowsHide: true });
console.log(java.status === 0 ? 'JAVA_AVAILABLE' : 'JAVA_NOT_FOUND');
console.log(
  existsSync('harmonyos/entry/src/main/resources/rawfile/offline/resource-index.json')
    ? 'OFFLINE_ASSETS_READY'
    : 'OFFLINE_ASSETS_NOT_BUILT',
);
if (!found) {
  console.log('HARMONYOS_BUILD_TOOL_NOT_FOUND');
  console.log(
    'Install Huawei DevEco Studio or the official Command Line Tools. For a custom install set MORI_HARMONY_TOOLS to its folder, then rerun.',
  );
  console.log(
    'Download: https://developer.huawei.com/consumer/cn/download/command-line-tools-for-hmos',
  );
  process.exitCode = 2;
}
