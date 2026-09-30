import { readFileSync, writeFileSync } from 'node:fs';

/**
 * nix 抓 npm 依赖用的 prefetch-npm-deps 是个 Rust 程序，它遍历 lockfile 里
 * 每一个包逐个下载，**完全不看 os / cpu**。于是这个 lock 里 76 个平台二进制包
 * 会全被拉一遍 —— 其中 67 个本机永远用不上（android / darwin / riscv64 …），
 * 每多一个，构建就多一次「网络一抖就整个失败」的机会。
 *
 * 所以把用不上的删掉。注意不能只删条目：父包的 optionalDependencies 里还留着
 * 引用，npm ci 会报 `Missing: xxx from lock file`，得连引用一起清。
 *
 * 跑完 `npm install`（会重新生成完整 lock）之后要再跑一次这个。
 */

const path = 'package-lock.json';
const lock = JSON.parse(readFileSync(path, 'utf8'));
const packages = lock.packages ?? {};

const nameOf = (key) => key.replace(/^.*node_modules\//, '');
const usable = (v) => {
  const os = v.os;
  const cpu = v.cpu;
  return (!os || os.includes('linux')) && (!cpu || cpu.includes('x64'));
};

const drop = new Set();
for (const [key, v] of Object.entries(packages)) {
  if (!key) continue;
  if (!v.os && !v.cpu) continue;
  if (!usable(v)) drop.add(nameOf(key));
}

for (const [key, v] of Object.entries(packages)) {
  if (!key) continue;
  if (drop.has(nameOf(key))) {
    delete packages[key];
    continue;
  }
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    const map = v[field];
    if (!map) continue;
    for (const name of Object.keys(map)) if (drop.has(name)) delete map[name];
  }
}

// v1 兼容段里也可能有
const flat = lock.dependencies;
if (flat) for (const name of Object.keys(flat)) if (drop.has(name)) delete flat[name];

writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
console.log(`裁掉 ${drop.size} 个用不上的平台包，剩 ${Object.keys(packages).length} 个`);
