// Base E2E repartie de zéro avant le démarrage du serveur (migrations depuis une base vide).
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
rmSync("prisma/e2e.db", { force: true });
rmSync("prisma/e2e.db-journal", { force: true });
rmSync(".data-e2e", { recursive: true, force: true });
execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: "file:./e2e.db" } });
