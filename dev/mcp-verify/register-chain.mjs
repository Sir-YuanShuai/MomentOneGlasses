// 注册 wx + language-model 两个 loader（整链路验证用）。
// language-model 指向 mock：记账话术不应触发 LLM；非记账话术返回 moment_search。
import { register } from 'node:module';

globalThis.__mcpVerifyLoader = register('./loader-chain.mjs', import.meta.url);
