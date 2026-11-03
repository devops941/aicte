import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { seedWorkflows } from "@/lib/seed/workflows";

/**
 * Idempotently ensures the data the app needs to function exists: the platform
 * admin account and the workflow definitions. Safe to run on every startup —
 * it creates only what is missing and skips what already exists.
 */
export async function ensureSeedData(): Promise<void> {
  const email = process.env.ADMIN_EMAIL ?? "admin@gmail.com";

  const existingAdmin = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!existingAdmin) {
    const password = process.env.ADMIN_PASSWORD ?? "Admin@123";
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        email,
        name: "System Administrator",
        passwordHash,
        role: "SUPER_ADMIN",
        designation: "Platform Administrator",
        isActive: true,
      },
    });
    console.log(`[auto-seed] created admin ${email}`);
  }

  // Only the real workflow definitions start with "WF-"; test leftovers use other prefixes.
  const realWorkflows = await prisma.workflowDefinition.count({ where: { code: { startsWith: "WF-" } } });
  if (realWorkflows === 0) {
    await seedWorkflows(prisma);
    console.log("[auto-seed] seeded workflow definitions");
  }
}
