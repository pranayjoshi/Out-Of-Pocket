import { parentPort, workerData } from 'node:worker_threads';
import { createMarketplace } from '../server/marketplace/domain.mjs';

const market = createMarketplace({ directory: workerData.directory, now: () => new Date(workerData.now) });
try {
  const user = market.userFromToken(workerData.token);
  const result = market.reserve(user, { listingId: workerData.listingId, idempotencyKey: workerData.key });
  parentPort.postMessage({ ok: true, id: result.id });
} catch (error) {
  parentPort.postMessage({ ok: false, code: error.code, message: error.message });
} finally {
  market.close();
}
