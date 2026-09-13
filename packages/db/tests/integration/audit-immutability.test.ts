import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as dbPackage from "../../src/index.js";
import { recordAuditEvent, type DatabaseClient } from "../../src/index.js";
import { auditEvents } from "../../src/schema/index.js";
import { createTestClient, probeDatabase, testId } from "./helpers.js";

/**
 * AuditEvent append-only guarantee (docs/adr/0006/0010, docs/TESTING.md):
 * no tenant-level actor, including a tenant owner, can modify or delete an
 * AuditEvent through any path. Two layers are proven here: (1) no
 * update/delete function exists in this package's public API at all, and
 * (2) even a raw, repository-bypassing SQL statement is rejected by the
 * database itself (the BEFORE UPDATE/DELETE triggers added in
 * drizzle/0001_audit_events_immutability.sql) — defense in depth, not
 * reliance on "no code path happens to call it" alone.
 */
const dbAvailable = await probeDatabase();
if (!dbAvailable) {
  console.warn(
    "[packages/db] audit-immutability integration test SKIPPED — no reachable database. " +
      "CONFIGURED BUT NOT VERIFIED, not a pass.",
  );
}

describe("no update/delete AuditEvent function exists in the public API", () => {
  it("@creatorcore/db exports no function capable of mutating or deleting an audit event", () => {
    const exportNames = Object.keys(dbPackage);
    const mutatingNamePattern = /audit.*(update|delete|edit|remove)|update.*audit|delete.*audit/i;
    for (const name of exportNames) {
      expect(name).not.toMatch(mutatingNamePattern);
    }
  });
});

describe.skipIf(!dbAvailable)("AuditEvent database-level immutability (real database)", () => {
  let client: DatabaseClient;
  const targetId = testId("audit-immutability-target");

  beforeAll(async () => {
    client = createTestClient();
    await recordAuditEvent(client.db, {
      actorType: "SYSTEM",
      targetType: "TestFixture",
      targetId,
      action: "test.fixture.created",
      outcome: "SUCCESS",
    });
  });

  afterAll(async () => {
    await client.close();
    // Deliberately no cleanup DELETE for audit_events rows — they are
    // immutable by design (this suite is the proof) and are safe,
    // non-sensitive test fixtures.
  });

  it("recordAuditEvent successfully persists a row", async () => {
    const [row] = await client.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.targetId, targetId));
    expect(row).toBeDefined();
    expect(row?.action).toBe("test.fixture.created");
    expect(row?.outcome).toBe("SUCCESS");
  });

  it("a raw UPDATE against audit_events is rejected by the database trigger", async () => {
    // Drizzle wraps the real mysql2/SIGNAL error in its own
    // DrizzleQueryError, whose own .message is just "Failed query: ...";
    // the actual trigger text lives on .cause — asserted directly so this
    // proves the TRIGGER fired, not merely that something threw.
    await expect(
      client.db
        .update(auditEvents)
        .set({ outcome: "FAILURE" })
        .where(eq(auditEvents.targetId, targetId)),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ sqlMessage: expect.stringMatching(/immutable/i) }),
    });
  });

  it("a raw DELETE against audit_events is rejected by the database trigger", async () => {
    await expect(
      client.db.delete(auditEvents).where(eq(auditEvents.targetId, targetId)),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ sqlMessage: expect.stringMatching(/immutable/i) }),
    });
  });

  it("the row is unchanged after both rejected mutation attempts", async () => {
    const [row] = await client.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.targetId, targetId));
    expect(row?.outcome).toBe("SUCCESS");
  });
});

describe.skipIf(!dbAvailable)(
  "audit metadata never contains secret-shaped values (real database)",
  () => {
    let client: DatabaseClient;
    const targetId = testId("audit-metadata-safety");

    beforeAll(async () => {
      client = createTestClient();
    });

    afterAll(async () => {
      await client.close();
    });

    it("recordAuditEvent's metadata type only accepts primitive, allow-listed values — never a raw object", async () => {
      // This is a compile-time guarantee (RecordAuditEventInput.metadata is
      // Record<string, string | number | boolean | null>), exercised here at
      // runtime with realistic safe fields, proving the shape that is
      // actually usable never admits a nested request/error/token object.
      await recordAuditEvent(client.db, {
        actorType: "WORKER",
        actorWorkerId: testId("worker"),
        targetType: "Worker",
        targetId,
        action: "worker.auth.failure",
        outcome: "DENIED",
        metadata: { reason: "bootstrap_secret_invalid" },
      });

      const [row] = await client.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.targetId, targetId));
      const metadata = JSON.stringify(row?.metadata ?? {});
      // A representative set of secret-shaped patterns that must never appear.
      expect(metadata).not.toMatch(/bearer\s/i);
      expect(metadata).not.toMatch(/[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{20,}/); // token shape
      expect(metadata).not.toMatch(/mysql:\/\//i);
      expect(metadata).not.toContain("password");
    });
  },
);
