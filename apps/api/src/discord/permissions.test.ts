import { describe, expect, it } from "vitest";
import { hasGuildManagePermission } from "./permissions.js";

describe("hasGuildManagePermission (docs/DISCORD_RULES.md — bitfields, never role names)", () => {
  it("grants when ADMINISTRATOR bit is set", () => {
    expect(hasGuildManagePermission(String(0x8))).toBe(true);
  });

  it("grants when MANAGE_GUILD bit is set", () => {
    expect(hasGuildManagePermission(String(0x20))).toBe(true);
  });

  it("grants when both bits are set among many others (realistic large bitfield)", () => {
    // A realistic Discord permissions integer combining several bits,
    // including MANAGE_GUILD (0x20), exceeding Number.MAX_SAFE_INTEGER's
    // safe range in some real-world values -- always parsed as BigInt.
    const bits = (1n << 0x8n) | 0x20n | (1n << 40n);
    expect(hasGuildManagePermission(bits.toString())).toBe(true);
  });

  it("denies an ordinary member with no relevant bits", () => {
    // SEND_MESSAGES (0x800) only.
    expect(hasGuildManagePermission(String(0x800))).toBe(false);
  });

  it("denies zero permissions", () => {
    expect(hasGuildManagePermission("0")).toBe(false);
  });

  it("fails closed on a malformed permissions string", () => {
    expect(hasGuildManagePermission("not-a-number")).toBe(false);
    expect(hasGuildManagePermission("")).toBe(false);
  });
});
