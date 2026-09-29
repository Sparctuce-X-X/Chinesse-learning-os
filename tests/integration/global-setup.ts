import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

/** Base de test repartie de zéro : vérifie aussi que les migrations s'appliquent sur une base vide. */
export default async function setup() {
  rmSync("prisma/test.db", { force: true });
  rmSync("prisma/test.db-journal", { force: true });
  rmSync(".data-test", { recursive: true, force: true });
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
