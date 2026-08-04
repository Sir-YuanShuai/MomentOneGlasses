import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const requiredEntries = ['AGENTS.md', 'app.js', 'app.json', 'pages', 'services'];
const optionalEntries = ['assets', 'prompts'];
const maxAixBytes = 10_000_000;

const version = packageConfig.version;
if (!version || typeof version !== 'string') {
  console.error('AIX 打包失败：package.json 缺少合法的 version。');
  process.exit(1);
}

for (const entry of requiredEntries) {
  if (!fs.existsSync(path.join(projectRoot, entry))) {
    console.error(`AIX 打包失败：缺少必需资源 ${entry}。`);
    process.exit(1);
  }
}

const defaultOutput = path.join('dist', `moment-one-${version}.aix`);
const requestedOutput = process.argv[2] || defaultOutput;
const outputPath = path.resolve(projectRoot, requestedOutput);

if (path.extname(outputPath).toLowerCase() !== '.aix') {
  console.error(`AIX 打包失败：输出文件必须使用 .aix 扩展名：${requestedOutput}`);
  process.exit(1);
}

const stagingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'moment-one-aix-'));
const packagedEntries = [...requiredEntries];

try {
  for (const entry of requiredEntries) {
    fs.cpSync(path.join(projectRoot, entry), path.join(stagingDirectory, entry), {
      recursive: true,
    });
  }

  for (const entry of optionalEntries) {
    const source = path.join(projectRoot, entry);
    if (!fs.existsSync(source)) continue;

    fs.cpSync(source, path.join(stagingDirectory, entry), { recursive: true });
    packagedEntries.push(entry);
  }

  // AIUI 要求 VERSION 文件为唯一 UUID，用于版本校验和热更新。
  // 设备会根据 VERSION 判断是否需要更新缓存的页面文件。
  // 固定版本号会导致设备误判"版本未变"而不触发更新，旧页面文件会持续缓存。
  const buildUuid = crypto.randomUUID();
  fs.writeFileSync(path.join(stagingDirectory, 'VERSION'), buildUuid);
  packagedEntries.push('VERSION');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

  execFileSync('/usr/bin/zip', ['-X', '-9', '-q', '-r', outputPath, ...packagedEntries], {
    cwd: stagingDirectory,
    stdio: 'inherit',
  });

  const size = fs.statSync(outputPath).size;
  const relativeOutput = path.relative(projectRoot, outputPath) || path.basename(outputPath);

  if (size > maxAixBytes) {
    console.error(
      `AIX 打包失败：${relativeOutput} 为 ${size} 字节，超过 10 MB（${maxAixBytes} 字节）限制。`,
    );
    process.exitCode = 1;
  } else {
    console.log(`AIX 打包完成：${relativeOutput}`);
    console.log(`包体积：${(size / 1_000_000).toFixed(3)} MB（${size} 字节）`);
    console.log(`版本：${version}`);
    console.log(`构建 UUID（VERSION）：${buildUuid}`);
  }
} catch (error) {
  console.error(`AIX 打包失败：${error.message}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(stagingDirectory, { recursive: true, force: true });
}
