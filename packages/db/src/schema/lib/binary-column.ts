import { customType } from "drizzle-orm/mysql-core";

/**
 * A fixed-length `varbinary` column that round-trips as a Node `Buffer`.
 * Drizzle's built-in binary handling calls `.toString()` on driver values,
 * which corrupts non-UTF8 bytes (ciphertext, nonces, auth tags) — this
 * custom type bypasses that and is required for every encrypted-at-rest
 * column (docs/adr/0007-credential-encryption.md).
 */
export const customBinary = (name: string, length: number) =>
  customType<{ data: Buffer; driverData: Buffer | string }>({
    dataType() {
      return `varbinary(${length})`;
    },
    toDriver(val: Buffer): Buffer {
      return val;
    },
    fromDriver(val: unknown): Buffer {
      if (Buffer.isBuffer(val)) {
        return val;
      }
      return Buffer.from(val as string, "binary");
    },
  })(name);
