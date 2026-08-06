// 记账话术门槛（纯函数，无依赖）：极窄的通道判断，命中后走远程
// bookkeeping_plan 确定性解析。这不是工具定义或提示词内容。
const BOOKKEEPING_GATE = /记账|记(?:一笔|一下|个)|账本|账单|花了|消费|收支|结余|开销|支出|收入|明细|流水|入账|赚了|用了(\d|多少)/;

export function looksLikeBookkeeping(input) {
  return BOOKKEEPING_GATE.test(String(input || ''));
}
