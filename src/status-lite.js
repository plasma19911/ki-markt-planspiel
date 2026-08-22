export function agentStatusLite(status = {}) {
  return {
    candidates: Array.isArray(status?.candidates) ? status.candidates : [],
    positions: Array.isArray(status?.positions) ? status.positions : [],
    history: Array.isArray(status?.history) ? status.history : [],
  };
}

export function shouldServeAgentLite(request) {
  const ua = String(request?.headers?.get?.('user-agent') || '');
  return /\bKI-Markt-Agent\/2\.2\.1\b/i.test(ua);
}
