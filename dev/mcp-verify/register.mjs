// 注册 wx loader（验证脚本入口：node --import ./register.mjs ./verify.mjs）
import { register } from 'node:module';

globalThis.__mcpVerifyLoader = register('./loader.mjs', import.meta.url);
