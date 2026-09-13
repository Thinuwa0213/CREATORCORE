const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;

/**
 * Discord permission bitfields arrive as decimal strings (large enough to
 * exceed a JS number's safe integer range) — always parsed as BigInt, never
 * inferred from role names (docs/DISCORD_RULES.md). A malformed/missing
 * value fails closed (no permission), never throws.
 */
export function hasGuildManagePermission(permissions: string): boolean {
  try {
    const bits = BigInt(permissions);
    return (bits & ADMINISTRATOR) !== 0n || (bits & MANAGE_GUILD) !== 0n;
  } catch {
    return false;
  }
}
