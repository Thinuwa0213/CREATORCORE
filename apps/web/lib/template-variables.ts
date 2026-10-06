/**
 * Standardized Template Variables for CreatorCore.
 * Used uniformly across all modules (Welcome, Boosters, Invites, Levels, Notifications).
 */

export interface TemplateVariable {
  token: string;
  label: string;
  description: string;
  example: string;
  category: "user" | "server" | "channel" | "misc";
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  {
    token: "{user}",
    label: "Mention User",
    description: "Mentions the new member directly (@User)",
    example: "@NewMember",
    category: "user",
  },
  {
    token: "{user.name}",
    label: "Username",
    description: "The plain username without pinging",
    example: "Alex",
    category: "user",
  },
  {
    token: "{server}",
    label: "Server Name",
    description: "The name of your Discord server",
    example: "Creator Realm",
    category: "server",
  },
  {
    token: "{memberCount}",
    label: "Member Count",
    description: "Total members currently in the server",
    example: "1,420",
    category: "server",
  },
  {
    token: "{channel}",
    label: "Channel",
    description: "Mentions the announcement channel",
    example: "#welcome",
    category: "channel",
  },
];

export const WELCOME_VARIABLES: TemplateVariable[] = TEMPLATE_VARIABLES.filter((v) =>
  ["{user}", "{user.name}", "{server}", "{memberCount}"].includes(v.token),
);

/**
 * Replaces standard placeholders in a string with sample preview data.
 */
export function formatTemplatePreview(
  template: string,
  overrides?: Partial<Record<string, string>>,
): string {
  if (!template) return "";

  const defaults: Record<string, string> = {
    "{user}": "@NewMember",
    "{user.name}": "Alex",
    "{server}": "Creator Realm",
    "{memberCount}": "1,420",
    "{channel}": "#welcome-and-rules",
    ...overrides,
  };

  let result = template;
  for (const [token, value] of Object.entries(defaults)) {
    result = result.replaceAll(token, value);
  }
  return result;
}
