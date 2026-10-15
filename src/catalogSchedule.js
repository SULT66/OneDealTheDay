// Four catalog updates per local market day. The midnight run also selects
// the Daily Drop; the other three preserve it. These split crons never overlap.
const HOURS = 6;
const DAILY_CRON = '15 0 * * *';
const OFFER_CRON = '15 6,12,18 * * *';
const MERCHANDISING_CRON = '23 */6 * * *';

function startupSelectionDue(lastStartedAt, now = Date.now()) {
  return !Number.isFinite(lastStartedAt) || now - lastStartedAt >= HOURS * 3600000;
}
module.exports = {HOURS, DAILY_CRON, OFFER_CRON, MERCHANDISING_CRON, startupSelectionDue};
