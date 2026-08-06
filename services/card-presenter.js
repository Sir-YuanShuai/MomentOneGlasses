function itemMeta(moment) {
  return [
    moment && moment.occurredAt ? String(moment.occurredAt).slice(0, 10) : '',
    moment && moment.location && moment.location.name ? moment.location.name : '',
  ].filter(Boolean).join(' · ');
}

export function createMomentResultCard({ operationLabel, statusTitle, summary, moment, continuationHint }) {
  return {
    route: 'pages/cards/moment-result',
    data: {
      operationLabel: operationLabel || 'Moment',
      statusTitle: statusTitle || '',
      summary: summary || '',
      timeLabel: moment && moment.occurredAt ? String(moment.occurredAt).slice(0, 16).replace('T', ' ') : '',
      locationName: moment && moment.location && moment.location.name ? moment.location.name : '',
      tagsText: moment && Array.isArray(moment.tags) ? moment.tags.join(' · ') : '',
      continuationHint: continuationHint || '可继续用语音查询或修改',
    },
  };
}

export function createMemoryAnswerCard({ question, answer, evidence }) {
  const moments = Array.isArray(evidence) ? evidence : [];
  return {
    route: 'pages/cards/memory-answer',
    data: {
      question: String(question || ''),
      answer: String(answer || ''),
      evidenceCount: moments.length,
      items: moments.slice(0, 3).map((moment) => ({
        title: String(moment.title || '未命名 Moment'),
        meta: itemMeta(moment),
      })),
    },
  };
}


export function createAccountUnbindCard({ accountLabel = '当前账号' } = {}) {
  return {
    route: 'pages/cards/account-unbind',
    data: {
      accountLabel: String(accountLabel || '当前账号'),
      status: 'confirm',
      message: '解绑后会清除本机账号凭据，需要重新扫码才能继续使用账号功能。',
      remoteRevoked: false,
    },
  };
}

export function createAccountUnbindResultCard({ accountLabel = '当前账号', message, remoteRevoked = false } = {}) {
  return {
    route: 'pages/cards/account-unbind',
    data: {
      accountLabel: String(accountLabel || '当前账号'),
      status: remoteRevoked ? 'success' : 'error',
      message: String(message || ''),
      remoteRevoked: Boolean(remoteRevoked),
    },
  };
}
