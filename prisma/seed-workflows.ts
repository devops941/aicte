import "dotenv/config";
import { createPrismaClient } from "../src/lib/db";
import { seedWorkflows } from "../src/lib/seed/workflows";

const prisma = createPrismaClient();

async function main() {
  console.log("Seeding workflows...");

  // Delete orphaned integration-test workflows
  const deleted = await prisma.workflowDefinition.deleteMany({
    where: { code: { startsWith: "ITEST-" } },
  });
  console.log(`  deleted ${deleted.count} orphaned ITEST-* workflow(s)`);

  // Seed the real workflows
  await seedWorkflows(prisma);
  console.log("  workflows with stages and transitions seeded");

  // Print final list
  const definitions = await prisma.workflowDefinition.findMany({
    include: { stages: { orderBy: { sequence: "asc" } } },
  });

  console.log("\nFinal workflow list:");
  for (const def of definitions) {
    const stageList = def.stages.map((s) => s.code).join(" -> ");
    console.log(`  ${def.code} (${def.applicationType}): ${stageList}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
