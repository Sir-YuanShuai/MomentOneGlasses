import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const checked = [];

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function collectFiles(directory, extension) {
  const absoluteDirectory = path.join(projectRoot, directory);
  if (!fs.existsSync(absoluteDirectory)) return [];

  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(relativePath, extension);
    return relativePath.endsWith(extension) ? [relativePath] : [];
  });
}

function validateJson(relativePath) {
  try {
    JSON.parse(read(relativePath));
    checked.push(relativePath);
  } catch (error) {
    errors.push(`${relativePath}: JSON 解析失败：${error.message}`);
  }
}

function validateJavaScript(relativePath, source = null) {
  const temporaryPath = source === null
    ? path.join(projectRoot, relativePath)
    : path.join(os.tmpdir(), `moment-one-${relativePath.replaceAll('/', '-')}-${Date.now()}.mjs`);

  try {
    if (source !== null) fs.writeFileSync(temporaryPath, source);
    execFileSync(process.execPath, ['--check', temporaryPath], { stdio: 'pipe' });
    checked.push(relativePath);
  } catch (error) {
    const output = String(error.stderr || error.stdout || error.message).trim();
    errors.push(`${relativePath}: JavaScript 语法检查失败：\n${output}`);
  } finally {
    if (source !== null && fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

validateJson('app.json');
validateJavaScript('app.js');
collectFiles('services', '.js').forEach((file) => validateJavaScript(file));

let appConfig = null;
try {
  appConfig = JSON.parse(read('app.json'));
} catch {
  // JSON 错误已由 validateJson 记录。
}

const inkFiles = collectFiles('pages', '.ink');

if (appConfig && Array.isArray(appConfig.pages)) {
  appConfig.pages.forEach((route) => {
    const pagePath = `${route}.ink`;
    if (!fs.existsSync(path.join(projectRoot, pagePath))) {
      errors.push(`app.json: 路由 ${route} 对应的 ${pagePath} 不存在`);
    }
  });
}

inkFiles.forEach((relativePath) => {
  const source = read(relativePath);
  const defMatch = source.match(/<script\s+def>\s*([\s\S]*?)\s*<\/script>/);
  const setupMatch = source.match(/<script\s+setup>\s*([\s\S]*?)\s*<\/script>/);

  if (!defMatch) {
    errors.push(`${relativePath}: 缺少 <script def>`);
  } else {
    try {
      JSON.parse(defMatch[1]);
    } catch (error) {
      errors.push(`${relativePath}: <script def> 不是合法 JSON：${error.message}`);
    }
  }

  if (!setupMatch) {
    errors.push(`${relativePath}: 缺少 <script setup>`);
  } else {
    validateJavaScript(`${relativePath}::<script setup>`, setupMatch[1]);
  }

  if (!/<page>[\s\S]*<\/page>/.test(source)) {
    errors.push(`${relativePath}: 缺少 <page> 模板`);
  }

  if (!/<style>[\s\S]*<\/style>/.test(source)) {
    errors.push(`${relativePath}: 缺少 <style>`);
  }
});

if (errors.length) {
  console.error(`\nAIUI 检查失败，共 ${errors.length} 个问题：\n`);
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}\n`));
  process.exitCode = 1;
} else {
  console.log(`AIUI 静态检查通过：${checked.length} 个脚本/配置，${inkFiles.length} 个 .ink 页面。`);
}
