/**
 * Discord OAuth provider configuration (Phase 5, docs/adr/0003).
 *
 * `disableDefaultScope: true` is required, not cosmetic: the installed
 * `better-auth@1.7.4` Discord provider's default scope list is
 * `["identify", "email"]` and `options.scope` is *appended* to it, not
 * substituted (`@better-auth/core/dist/social-providers/discord.mjs`) — so
 * omitting `disableDefaultScope` here would silently request `identify
 * email guilds` regardless of what `scope` says, violating the locked
 * "identify guilds only, no email" requirement.
 *
 * `mapProfileToUser` supplies a synthetic, non-resolvable placeholder email
 * (never a real address, never collected from Discord) purely to satisfy
 * Better Auth's core `user.email` column, which is unconditionally required
 * (`z.string()`, not nullish) even though the `email` scope is never
 * requested. `profile.id` (the Discord snowflake, always present under
 * `identify` alone) makes each placeholder unique and stable.
 */
export interface DiscordProviderConfig {
  clientId: string;
  clientSecret: string;
}

interface DiscordProfile {
  id: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
}

export function buildDiscordSocialProvider(config: DiscordProviderConfig) {
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    disableDefaultScope: true,
    scope: ["identify", "guilds"],
    mapProfileToUser: (profile: DiscordProfile) => ({
      name: profile.global_name ?? profile.username ?? "Discord User",
      email: `discord-${profile.id}@users.creatorcore.internal`,
      emailVerified: false,
      ...(profile.avatar
        ? {
            image: `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`,
          }
        : {}),
    }),
  };
}
