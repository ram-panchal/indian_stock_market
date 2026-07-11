import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env.local") });

import { getMaster } from "../src/lib/market/angelone/instrument-master";

async function attempt(n: number) {
  const start = Date.now();
  try {
    const master = await getMaster();
    console.log(`attempt ${n}: OK in ${Date.now() - start}ms, size=${master.eqBySymbol.size}`);
    return true;
  } catch (err) {
    console.log(`attempt ${n}: FAILED after ${Date.now() - start}ms:`, err instanceof Error ? err.message : err);
    return false;
  }
}

async function main() {
  for (let i = 1; i <= 3; i++) {
    const ok = await attempt(i);
    if (ok) break;
  }
}
main();
