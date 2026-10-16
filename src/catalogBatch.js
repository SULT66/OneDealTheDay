const { setImmediate: yieldToRequests } = require("node:timers/promises");
const pending = new Map();

// Let the other loopback APIs answer before their render deadlines expire.
// Concurrent identical reads share one presentation job.
function presentCatalogBatch(key, rows, present) {
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const result = [];
    for (let index = 0; index < rows.length; index++) {
      if (index > 0 && index % 50 === 0) await yieldToRequests();
      result.push(present(rows[index], index));
    }
    return result;
  })();
  pending.set(key, task);
  task.then(() => pending.delete(key), () => pending.delete(key));
  return task;
}
module.exports = { presentCatalogBatch };
