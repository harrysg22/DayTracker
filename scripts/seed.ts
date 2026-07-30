/**
 * Genera una base .dev-data/ledger-seed.db con ~60 días de datos
 * falsos realistas, para desarrollar UI/dashboard sin esperar a
 * acumular datos reales.
 *
 * Uso:
 *   npm run db:seed
 *   npm run db:seed -- --days=30 --out=./.dev-data/otra.db
 *
 * El archivo resultante es una base SQLite normal (mismo schema/migraciones
 * que usa la app vía expo-sqlite): se puede inspeccionar con cualquier
 * cliente SQLite, o copiar manualmente al sandbox de un simulador durante
 * desarrollo.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDataLayer } from "../src/db/dataLayer";
import * as schema from "../src/db/schema";
import { seedFakeData } from "../src/db/seedData";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const days = args.days ? Number(args.days) : 60;
  const outPath = path.resolve(args.out ?? "./.dev-data/ledger-seed.db");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath)) fs.rmSync(outPath);

  const sqlite = new Database(outPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, "../src/db/migrations") });

  const dataLayer = createDataLayer(db as any, {
    now: () => Date.now(),
    getTzOffsetMin: () => new Date().getTimezoneOffset(),
    genId: () => require("node:crypto").randomUUID(),
  });

  const result = await seedFakeData(dataLayer, { days });

  sqlite.close();

  console.log(`✔ Seed generado en ${outPath}`);
  console.log(`  categorías: ${result.categories.length}`);
  console.log(`  entries:    ${result.entryCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
