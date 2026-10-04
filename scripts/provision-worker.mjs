#!/usr/bin/env node
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".env");

if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const require = createRequire(path.join(repoRoot, "packages/db/package.json"));
const { eq } = require("drizzle-orm");

const {
  createDatabaseClient,
  provisionWorker,
  findWorkerById,
  assignEligibleWorkers,
} = await import("../packages/db/dist/index.js");

const {
  botApplications,
  workerEligibility,
  workers,
} = await import("../packages/db/dist/schema/index.js");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[provision-worker] DATABASE_URL is not set");
  process.exit(1);
}

const workerId = process.env.WORKER_ID;
if (!workerId) {
  console.error("[provision-worker] WORKER_ID is not set in .env");
  process.exit(1);
}

const dbClient = createDatabaseClient({ DATABASE_URL: databaseUrl });

try {
  let existing = await findWorkerById(dbClient.db, workerId);
  let bootstrapSecret = process.env.WORKER_BOOTSTRAP_SECRET;

  if (!existing || !bootstrapSecret) {
    console.log(`[provision-worker] Provisioning worker identity ${workerId}...`);
    if (existing) {
      await dbClient.db.delete(workers).where(eq(workers.id, workerId));
    }
    const res = await provisionWorker(dbClient.db, workerId);
    bootstrapSecret = res.bootstrapSecret;
    console.log(`[provision-worker] Worker provisioned in database.`);

    let envContent = fs.readFileSync(envPath, "utf-8");
    if (envContent.includes("WORKER_BOOTSTRAP_SECRET=")) {
      envContent = envContent.replace(
        /#?\s*WORKER_BOOTSTRAP_SECRET=.*/,
        `WORKER_BOOTSTRAP_SECRET=${bootstrapSecret}`,
      );
    } else {
      envContent += `\nWORKER_BOOTSTRAP_SECRET=${bootstrapSecret}\n`;
    }
    fs.writeFileSync(envPath, envContent, "utf-8");
    console.log(`[provision-worker] Updated .env with WORKER_BOOTSTRAP_SECRET.`);
  } else {
    console.log(`[provision-worker] Worker ${workerId} is already provisioned.`);
  }

  // Ensure all configured bot applications have worker eligibility assigned
  const allBots = await dbClient.db.select().from(botApplications);
  for (const bot of allBots) {
    const [eligible] = await dbClient.db
      .select()
      .from(workerEligibility)
      .where(eq(workerEligibility.botApplicationId, bot.id));
    if (!eligible) {
      console.log(`[provision-worker] Assigning worker eligibility for bot ${bot.id}...`);
      await assignEligibleWorkers(dbClient.db, bot.id);
    }
  }

  console.log(`\n[provision-worker] Setup completed successfully!`);
  console.log(`You can now run: pnpm dev:worker`);
} finally {
  await dbClient.close();
}
