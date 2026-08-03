const MAX_TRACE_EVENTS = 80;
const events = [];

function createTraceId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function createTurnTrace(utterance) {
  return {
    turnId: createTraceId('turn'),
    utteranceLength: String(utterance || '').length,
    startedAt: new Date().toISOString(),
  };
}

export function emitAgentTrace(turn, type, detail = {}) {
  const event = {
    turnId: turn && turn.turnId ? turn.turnId : createTraceId('turn'),
    type,
    at: new Date().toISOString(),
    ...detail,
  };
  events.push(event);
  if (events.length > MAX_TRACE_EVENTS) events.splice(0, events.length - MAX_TRACE_EVENTS);
  console.info('[moment-one:agent-trace]', JSON.stringify(event));
  return event;
}

export function listAgentTrace() {
  return events.slice();
}

export function clearAgentTrace() {
  events.length = 0;
}
