import { eq } from "drizzle-orm";
import { users } from "../schema/index.js";
import type { Db } from "../types.js";

export interface User {
  id: bigint;
  discordUsername: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** User is identified globally by Discord user ID -- not tenant-scoped itself (docs/adr/0006). */
export async function findUserById(db: Db, userId: bigint): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row;
}

export async function createUser(db: Db, userId: bigint, discordUsername?: string): Promise<User> {
  await db.insert(users).values({ id: userId, discordUsername: discordUsername ?? null });
  const created = await findUserById(db, userId);
  if (!created) {
    throw new Error("createUser: row not found immediately after insert");
  }
  return created;
}
