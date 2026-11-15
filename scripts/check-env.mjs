import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
let failures = 0;
function report(ok, message) {
  console.log(`${ok ? 'OK' : 'FAIL'} ${message}`);
  if (!ok) failures++;
}

const [major, minor] = process.versions.node.split('.').map(Number);
report(major === 22 && minor >= 12, `Node ${process.versions.node}（项目要求 22.12+、22.x）`);

const missing = [];
for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
  if (!existsSync(new URL(`node_modules/${name}/package.json`, root))) missing.push(name);
}
report(missing.length === 0, missing.length ? `尚未安装：${missing.join(', ')}` : '声明的依赖均已安装');
const lockPath = new URL('package-lock.json', root);
if (existsSync(lockPath)) {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const locked = lock.packages?.[''];
  const signature = (deps = {}) => JSON.stringify(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
  const matches = locked && ['dependencies', 'devDependencies'].every(
    (key) => signature(locked[key]) === signature(pkg[key]),
  );
  report(Boolean(matches), matches ? '依赖锁文件与当前配置一致' : '依赖锁文件尚未同步，请执行 npm install');
} else {
  report(false, '缺少 package-lock.json，请执行 npm install');
}

for (const path of ['tsconfig.json', 'vite.config.ts', 'index.html', 'src/main.ts', 'src/App.vue']) {
  report(existsSync(new URL(path, root)), path);
}

if (process.platform === 'darwin') {
  const cli = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
  console.log(`${existsSync(cli) ? 'OK' : 'INFO'} 微信开发者工具 CLI ${existsSync(cli) ? '已安装' : '未发现（不影响网页开发）'}`);
  console.log('INFO 小程序账号登录、服务端口和有效 AppID 需在开发者工具中单独确认。');
}

console.log(`项目目录：${fileURLToPath(root)}`);
console.log('依赖安装后继续执行 npm run build；本检查不代表浏览器、WebGL 或麦克风真机验证通过。');
process.exitCode = failures ? 1 : 0;
