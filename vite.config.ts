import { spawn, type ChildProcess } from "node:child_process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { createCampaignHandler } from "./server/campaigns-api.mjs";
import { createAdsHandler } from "./server/ads-api.mjs";
import { createScheduleHandler } from "./server/schedule-api.mjs";
import { createAgentHandler } from "./server/agent-api.mjs";

let apiProcess: ChildProcess | null = null;
let spawnedApi = false;
async function ensureMarketplaceApi() {
  try {
    if ((await fetch("http://127.0.0.1:8787/api/v1/health")).ok) return;
  } catch { /* Start the local API. */ }
  if (apiProcess) return;
  spawnedApi = true;
  apiProcess = spawn(process.execPath, ["server/marketplace/cli.mjs"], { stdio: "inherit", env: { ...process.env, RELAY_API_PORT: "8787" } });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch("http://127.0.0.1:8787/api/v1/health")).ok) return;
    } catch { /* Keep waiting for the database to open. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The marketplace API did not start on 127.0.0.1:8787.");
}
function stopMarketplaceApi() {
  if (spawnedApi) apiProcess?.kill();
}

const proxy = { "/api/v1": { target: "http://127.0.0.1:8787", changeOrigin: false } };
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const install = async (server: { middlewares: { use: (handler: ReturnType<typeof createAdsHandler>) => void } }) => {
    await ensureMarketplaceApi();
    server.middlewares.use(createScheduleHandler({ apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_SCHEDULE_MODEL || "google/gemma-4-31b-it" }));
    server.middlewares.use(createAgentHandler({ apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_AGENT_MODEL || "qwen/qwen3.5-35b-a3b" }));
    server.middlewares.use(createCampaignHandler());
    server.middlewares.use(createAdsHandler({ apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_IMAGE_MODEL || "black-forest-labs/flux.2-klein-4b" }));
    const http = "httpServer" in server ? (server as { httpServer?: { on: (event: string, listener: () => void) => void } }).httpServer : undefined;
    http?.on("close", stopMarketplaceApi);
  };
  return {
    plugins: [react(), { name: "relay-local-ads-api", configureServer: install, configurePreviewServer: install }],
    server: { proxy },
    preview: { proxy },
  };
});
