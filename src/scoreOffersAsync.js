const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { scoreOffers } = require('./ranker');

if (!isMainThread && workerData?.oddScoring) {
  // Keep comparison, eligibility, score and ordering identical to the sync path.
  parentPort.postMessage(scoreOffers(workerData.items, workerData.options));
  parentPort.close();
}

let pending = Promise.resolve();
function scoreOffersAsync(items, options = {}, {background = false} = {}) {
  if (!background || items.length < 50) return Promise.resolve(scoreOffers(items, options));
  // One CPU job at a time on the small production plan, even when markets overlap.
  const job = pending.then(() => new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {workerData:{oddScoring:true,items,options}});
    let returned = false;
    worker.once('message', result => { returned = true; resolve(result); });
    worker.once('error', reject);
    worker.once('exit', code => {
      if (!returned) reject(new Error(`Catalogue scoring worker exited without a result (${code})`));
    });
  }));
  pending = job.catch(() => {});
  return job;
}

module.exports = {scoreOffersAsync};
