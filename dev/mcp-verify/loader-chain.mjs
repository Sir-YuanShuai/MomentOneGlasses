// 将裸模块名 'wx' / 'language-model' 解析到测试替身。
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'wx') {
    return { url: new URL('./wx-shim.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (specifier === 'language-model') {
    return { url: new URL('./language-model-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
