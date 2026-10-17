import { createServer } from 'node:http';
import { join } from 'node:path';
import { createMarketplaceHandler } from './http.mjs';

const directory = process.env.RELAY_DATA_DIR || join(process.cwd(), '.relay-data');
const port = Number(process.env.RELAY_API_PORT || 8787);
const handler = createMarketplaceHandler({ directory });
createServer((req, res) => {
  handler(req, res, () => {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found.', code: 'not_found' }));
  });
}).listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ level: 'info', event: 'api.listen', port, directory }));
});
