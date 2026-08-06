// LanguageModel 测试替身：非记账话术返回 moment_search toolcall；
// 记账话术若走到这里说明预路由失效（应断言失败，见 chain-test.mjs）。
const calls = [];

function emitToolcall(listeners, event) {
  (listeners || []).forEach((listener) => listener(event));
}

export const LanguageModel = {
  async availability() {
    return 'available';
  },

  async create() {
    const listeners = [];
    return {
      addEventListener(type, listener) {
        if (type === 'toolcall') listeners.push(listener);
      },
      async prompt(input) {
        calls.push(input);
        emitToolcall(listeners, {
          callId: 'mock-1',
          index: 0,
          functionName: 'moment_search',
          arguments: { query: String(input || ''), mode: 'search', timeRange: 'unspecified' },
          isComplete: true,
        });
        return '';
      },
      destroy() {},
    };
  },
};
