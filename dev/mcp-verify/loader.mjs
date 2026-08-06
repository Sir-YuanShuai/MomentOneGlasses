// 将裸模块名 'wx' 解析到 wx-shim.mjs（仅验证用途）。
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'wx') {
    return {
      url: new URL('./wx-shim.mjs', import.meta.url).href,
      shortCircuit: true
    };
  }
  return nextResolve(specifier, context);
}
