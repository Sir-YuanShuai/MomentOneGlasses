import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createLlmProxyPlugin } from './llm-proxy.js';
import { createPhotoBridgePlugin } from './photo-bridge.js';

const devRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(devRoot, '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, 'AIUI_');
  const llmConfig = {
    endpoint: String(env.AIUI_LLM_ENDPOINT || '').trim(),
    apiKey: String(env.AIUI_LLM_API_KEY || '').trim(),
    model: String(env.AIUI_LLM_MODEL || '').trim(),
    apiStyle: String(env.AIUI_LLM_API_STYLE || 'openai-chat-completions').trim(),
    headers: String(env.AIUI_LLM_HEADERS || '').trim(),
    authHeader: String(env.AIUI_LLM_AUTH_HEADER || 'Authorization').trim(),
    authScheme: String(env.AIUI_LLM_AUTH_SCHEME || 'Bearer').trim()
  };
  return {
    root: devRoot,
    envDir: projectRoot,
    plugins: [createPhotoBridgePlugin(), createLlmProxyPlugin(llmConfig)],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      fs: {
        allow: [projectRoot]
      }
    },
    build: {
      outDir: path.resolve(projectRoot, 'dist-preview'),
      emptyOutDir: true
    }
  };
});
