// Editorial campaign priority. "all" restores the usual multi-theme rotation.
function merchandisingFocus() {
  const value = String(process.env.MERCHANDISING_FOCUS ?? 'halloween').trim().toLowerCase();
  return !value || value === 'all' ? null : value;
}
function focusSignals(signals, focus = merchandisingFocus()) {
  return focus ? signals.filter(signal => signal.kind === 'seasonal' && signal.metadata?.eventKey === focus) : signals;
}
module.exports = { merchandisingFocus, focusSignals };
