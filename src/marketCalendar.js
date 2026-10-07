const marketTimezones = Object.freeze({"us": "America/New_York", "ca": "America/Toronto", "uk": "Europe/London", "fr": "Europe/Paris", "de": "Europe/Berlin"});
function isCheckedToday(checkedAt, marketCode, now = new Date()) {
  if (!checkedAt) return false;
  const checked = new Date(checkedAt);
  if (!Number.isFinite(checked.getTime())) return false;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: marketTimezones[marketCode] || marketTimezones.us });
  return formatter.format(checked) === formatter.format(now);
}

module.exports = { marketTimezones, isCheckedToday };
