import "dotenv/config";
import { createPrismaClient } from "../src/lib/db";
import bcrypt from "bcryptjs";

const prisma = createPrismaClient();

/**
 * Minimal seed: creates only the platform admin account so the app is
 * loginable on a fresh database. All other data (regions, institutions,
 * users, workflows, holidays, escalations) is entered manually.
 */
async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@gmail.com";
  const password = process.env.ADMIN_PASSWORD ?? "Admin@123";
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    // Password is only set on create, so re-seeding never clobbers a changed password.
    update: {
      name: "System Administrator",
      role: "SUPER_ADMIN",
      designation: "Platform Administrator",
      isActive: true,
    },
    create: {
      email,
      name: "System Administrator",
      passwordHash,
      role: "SUPER_ADMIN",
      designation: "Platform Administrator",
      isActive: true,
    },
  });

  console.log("Seed complete — admin only.");
  console.log(`  Admin:    ${admin.email} (SUPER_ADMIN)`);
  console.log(`  Password: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
