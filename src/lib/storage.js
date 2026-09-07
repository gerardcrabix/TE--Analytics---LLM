// All persistence for this app lives in the browser's localStorage — nothing
// is ever sent to, or stored on, a server. That's a deliberate choice: the
// imported files contain real employee data, and this repository ships with
// zero data committed to it (see README). Each browser/profile keeps its own
// copy of whatever has been imported there.

export const KEYS = {
  data: 'llmDash.data.v1',
  dataHistory: 'llmDash.dataHistory.v1',
  reclass: 'llmDash.reclass.v1',
  recommendations: 'llmDash.recommendations.v1',
  settings: 'llmDash.settings.v1',
};

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage full or unavailable (private mode) — fail silently, the
    // UI keeps working in-memory for the session.
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
