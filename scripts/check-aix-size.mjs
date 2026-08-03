import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 发布规则：最终 AIX 分发包不得超过 10 MB（十进制，10,000,000 字节）。
const MAX_AIX_BYTES = 10_000_000;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist-preview']);

function formatMegabytes(bytes) {
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

function collectAixFiles(targetPath, requireAixFile = false) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`路径不存在：${targetPath}`);
  }

  const stats = fs.statSync(targetPath);
  if (stats.isFile()) {
    if (path.extname(targetPath).toLowerCase() !== '.aix') {
      if (requireAixFile) {
        throw new Error(`不是 .aix 文件：${targetPath}`);
      }
      return [];
    }
    return [targetPath];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  return fs.readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      return [];
    }
    return collectAixFiles(path.join(targetPath, entry.name));
  });
}

const requestedTargets = process.argv.slice(2);
const targets = requestedTargets.length > 0
  ? requestedTargets.map((target) => path.resolve(projectRoot, target))
  : [projectRoot];

let aixFiles;
try {
  aixFiles = [...new Set(targets.flatMap((target) => collectAixFiles(target, true)))];
} catch (error) {
  console.error(`AIX 大小校验失败：${error.message}`);
  process.exit(1);
}

if (aixFiles.length === 0) {
  console.error('AIX 大小校验失败：未找到 .aix 文件。');
  console.error('请先完成打包，再执行：npm run check:aix-size -- <AIX 文件或目录>');
  process.exit(1);
}

let hasOversizedPackage = false;

for (const aixFile of aixFiles) {
  const size = fs.statSync(aixFile).size;
  const relativePath = path.relative(projectRoot, aixFile) || path.basename(aixFile);

  if (size > MAX_AIX_BYTES) {
    hasOversizedPackage = true;
    console.error(
      `超出限制：${relativePath} 为 ${formatMegabytes(size)}（${size} 字节），` +
      `上限为 ${formatMegabytes(MAX_AIX_BYTES)}（${MAX_AIX_BYTES} 字节）。`,
    );
  } else {
    console.log(
      `大小合规：${relativePath} 为 ${formatMegabytes(size)}（${size} 字节），` +
      `未超过 ${formatMegabytes(MAX_AIX_BYTES)}。`,
    );
  }
}

if (hasOversizedPackage) {
  process.exit(1);
}
