import { test, expect } from "@playwright/test";

const API_BASE_URL = "http://localhost:8787";

test.describe("CreatorCore Phase 5 Browser Flow & E2E Suite", () => {
  test("1. Unauthenticated visitor cannot access protected pages and sees sign-in surface", async ({
    page,
  }) => {
    // Visit home page
    await page.goto("/");
    await expect(page.locator("#discord-sign-in-button")).toBeVisible();
    await expect(page.locator("#unauthenticated-view")).toBeVisible();
    await expect(page.locator("#authenticated-view")).toHaveCount(0);

    // Attempt direct navigation to /guilds -> redirects to /
    await page.goto("/guilds");
    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.locator("#discord-sign-in-button")).toBeVisible();

    // Attempt direct navigation to arbitrary tenant/guild page -> redirects to /
    await page.goto("/tenants/mock-tenant-id/guilds/123456789");
    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("2. Full end-to-end flow: bootstrap session, list guilds, connect, onboard bot, truthful runtime status", async ({
    page,
    context,
    request,
  }) => {
    const runId = String(Date.now());
    const discordUserId = `90${runId.padStart(16, "0").slice(-16)}`;
    const testGuildId = `91${runId.padStart(16, "0").slice(-16)}`;
    const testGuildName = "CreatorCore Community Hub";
    const botSecretToken = `deterministic-valid-discord-bot-token-${runId}`;

    // 1. Set up manageable guild in FakeDiscordGuildProvider via test harness
    const guildsRes = await request.post(`${API_BASE_URL}/internal/test/discord/guilds`, {
      data: {
        discordUserId,
        guilds: [{ id: testGuildId, name: testGuildName }],
      },
    });
    expect(guildsRes.status()).toBe(200);

    // 2. Bootstrap legitimate Better Auth user & session via test harness (Amendment 1)
    const sessionRes = await request.post(`${API_BASE_URL}/internal/test/session`, {
      data: {
        discordUserId,
        name: "E2E Verified Tester",
      },
    });
    expect(sessionRes.status()).toBe(200);
    const sessionData = await sessionRes.json();
    expect(sessionData.ok).toBe(true);
    expect(sessionData.sessionToken).toBeTruthy();
    expect(sessionData.cookieValue).toBeTruthy();

    // 3. Set legitimate, signed better-auth.session_token cookie in Playwright browser context
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: sessionData.cookieValue,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    // 4. Visit home page as authenticated user
    await page.goto("/");
    await expect(page.locator("#authenticated-view")).toBeVisible();
    await expect(page.locator("#user-display-name")).toHaveText("E2E Verified Tester");
    await expect(page.locator("#select-guild-link")).toBeVisible();

    // 5. Navigate to /guilds and verify manageable guilds listed
    await page.locator("#select-guild-link").click();
    await expect(page).toHaveURL("http://localhost:3000/guilds");
    await expect(page.locator("#manageable-guilds-list")).toBeVisible();

    const guildItem = page.locator(`#guild-item-${testGuildId}`);
    await expect(guildItem).toBeVisible();
    await expect(page.locator(`#guild-name-${testGuildId}`)).toHaveText(testGuildName);

    // 6. Connect guild to CreatorCore
    const connectBtn = page.locator(`#connect-guild-button-${testGuildId}`);
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();

    // 7. Should navigate to /tenants/[tenantId]/guilds/[guildId]
    await expect(page).toHaveURL(new RegExp(`/tenants/[^/]+/guilds/${testGuildId}$`));
    await expect(page.locator("#guild-overview-card")).toBeVisible();
    await expect(page.locator("#overview-guild-id")).toHaveText(testGuildId);

    // 8. Verify initial authoritative status is NOT_CONFIGURED (Amendment 3)
    const statusBadge = page.locator("#overview-runtime-status-badge");
    await expect(statusBadge).toHaveText("NOT_CONFIGURED");
    await expect(page.locator("#overview-credential-status")).toHaveText("None");

    // 9. Navigate to Bot Setup page
    const setupLink = page.locator("#setup-bot-link");
    await expect(setupLink).toBeVisible();
    await setupLink.click();

    await expect(page).toHaveURL(new RegExp(`/tenants/[^/]+/guilds/${testGuildId}/setup$`));
    await expect(page.locator("#bot-setup-form")).toBeVisible();

    // 10. Fill in credentials and submit
    await page.locator("#bot-name-input").fill("My Production Bot");
    const tokenInput = page.locator("#bot-token-input");
    await tokenInput.fill(botSecretToken);

    // Submit credentials
    await page.locator("#submit-bot-credentials-btn").click();

    // 11. Verify token hygiene: token must NOT remain in DOM or storage
    // Token input cleared
    await expect(tokenInput).toHaveValue("");

    // Successfully redirects back to overview
    await expect(page).toHaveURL(new RegExp(`/tenants/[^/]+/guilds/${testGuildId}$`));

    // 12. Verify updated truthful status: UNASSIGNED (Amendment 3: control-plane authoritative state)
    await expect(page.locator("#overview-runtime-status-badge")).toHaveText("UNASSIGNED");
    await expect(page.locator("#overview-credential-status")).toHaveText("Stored & Encrypted");
    await expect(page.locator("#overview-bot-app-status")).toContainText("Configured");
    await expect(page.locator("#bot-configured-notice")).toBeVisible();

    // 13. Strict token secrecy assertions: secret token must NEVER appear anywhere in page DOM, storage, or HTML
    const pageHtml = await page.content();
    expect(pageHtml.includes(botSecretToken)).toBe(false);

    const localStorageHasToken = await page.evaluate(
      (secret) => JSON.stringify(window.localStorage).includes(secret),
      botSecretToken,
    );
    expect(localStorageHasToken).toBe(false);

    const sessionStorageHasToken = await page.evaluate(
      (secret) => JSON.stringify(window.sessionStorage).includes(secret),
      botSecretToken,
    );
    expect(sessionStorageHasToken).toBe(false);
  });

  test("3. Access control: cross-tenant access is forbidden", async ({
    page,
    context,
    request,
  }) => {
    const discordUserId = `93${String(Date.now()).padStart(16, "0").slice(-16)}`;

    // Bootstrap user session
    const sessionRes = await request.post(`${API_BASE_URL}/internal/test/session`, {
      data: {
        discordUserId,
        name: "Restricted User",
      },
    });
    const sessionData = await sessionRes.json();

    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: sessionData.cookieValue,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    // Try accessing a guild belonging to a non-existent or foreign tenant
    await page.goto("/tenants/foreign-tenant-uuid/guilds/9999999999");
    await expect(page.locator("#access-denied-container")).toBeVisible();
    await expect(page.locator("#access-denied-message")).toBeVisible();
  });

  test("4. Phase 6A Dashboard Shell: renders truthful navigation, theme toggle, and no internal phase labels", async ({
    page,
    context,
    request,
  }) => {
    const runId = String(Date.now());
    const discordUserId = `94${runId.padStart(16, "0").slice(-16)}`;
    const testGuildId = `95${runId.padStart(16, "0").slice(-16)}`;
    const testGuildName = "CreatorCore Community Lab";

    // Bootstrap test guild & session
    await request.post(`${API_BASE_URL}/internal/test/discord/guilds`, {
      data: {
        discordUserId,
        guilds: [{ id: testGuildId, name: testGuildName }],
      },
    });

    const sessionRes = await request.post(`${API_BASE_URL}/internal/test/session`, {
      data: {
        discordUserId,
        name: "Dashboard Shell Tester",
      },
    });
    const sessionData = await sessionRes.json();

    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: sessionData.cookieValue,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    // Connect guild first
    await page.goto("/guilds");
    await page.locator(`#connect-guild-button-${testGuildId}`).click();
    await expect(page).toHaveURL(new RegExp(`/tenants/[^/]+/guilds/${testGuildId}$`));

    // 1. Shell renders desktop sidebar
    const sidebar = page.locator("#app-sidebar");
    await expect(sidebar).toBeVisible();

    // 2. Brand wordmark is visible, and NO internal phase labels exist in DOM (Amendment 1)
    const sidebarText = await sidebar.innerText();
    expect(sidebarText.includes("CreatorCore")).toBe(true);
    expect(sidebarText.includes("Phase 1")).toBe(false);
    expect(sidebarText.includes("Phase 5")).toBe(false);
    expect(sidebarText.includes("Phase 6")).toBe(false);
    expect(sidebarText.includes("Gate")).toBe(false);

    // 3. Truthful navigation links exist and work
    const overviewLink = page.locator("#nav-guild-overview");
    const setupLink = page.locator("#nav-bot-setup");
    await expect(overviewLink).toBeVisible();
    await expect(setupLink).toBeVisible();

    // Navigate to bot configuration via sidebar
    await setupLink.click();
    await expect(page).toHaveURL(new RegExp(`/tenants/[^/]+/guilds/${testGuildId}/setup$`));
    await expect(page.locator("#bot-setup-form")).toBeVisible();

    // Navigate back to overview via sidebar
    await page.locator("#nav-guild-overview").click();
    await expect(page).toHaveURL(new RegExp(`/tenants/[^/]+/guilds/${testGuildId}$`));
    await expect(page.locator("#guild-overview-card")).toBeVisible();

    // 4. Header breadcrumbs and theme toggle
    await expect(page.locator('button[data-sidebar="trigger"]')).toBeVisible();
    const themeBtn = page.locator("#theme-toggle-btn");
    await expect(themeBtn).toBeVisible();

    // Toggle theme: verify HTML class changes
    await themeBtn.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await themeBtn.click();
    await expect(page.locator("html")).toHaveClass(/light/);
  });

  test("5. Phase 6A Guild Switcher: displays only authorized connected guilds and links to discovery", async ({
    page,
    context,
    request,
  }) => {
    const runId = String(Date.now());
    const discordUserId = `96${runId.padStart(16, "0").slice(-16)}`;
    const connectedGuildId = `97${runId.padStart(16, "0").slice(-16)}`;
    const unconnectedGuildId = `98${runId.padStart(16, "0").slice(-16)}`;

    // Set up two guilds in Discord: one to be connected, one left unconnected
    await request.post(`${API_BASE_URL}/internal/test/discord/guilds`, {
      data: {
        discordUserId,
        guilds: [
          { id: connectedGuildId, name: "Connected Server Hub" },
          { id: unconnectedGuildId, name: "Unconnected Server" },
        ],
      },
    });

    const sessionRes = await request.post(`${API_BASE_URL}/internal/test/session`, {
      data: {
        discordUserId,
        name: "Switcher Tester",
      },
    });
    const sessionData = await sessionRes.json();

    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: sessionData.cookieValue,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    // Connect only the first guild
    await page.goto("/guilds");
    await page.locator(`#connect-guild-button-${connectedGuildId}`).click();
    await expect(page).toHaveURL(new RegExp(`/tenants/[^/]+/guilds/${connectedGuildId}$`));

    // Open guild switcher dropdown
    const switcherTrigger = page.locator("#guild-switcher-trigger");
    await expect(switcherTrigger).toBeVisible();
    await expect(page.locator("#active-guild-name")).toHaveText("Connected Server Hub");
    await switcherTrigger.click();

    // Check dropdown content (Amendment 2):
    // 1. Current connected guild is listed
    await expect(page.getByRole("menuitem", { name: /Connected Server Hub/i })).toBeVisible();

    // 2. Unconnected guild is NOT in the switcher dropdown
    await expect(page.getByRole("menuitem", { name: /Unconnected Server/i })).toHaveCount(0);

    // 3. Action to navigate to /guilds for discovery/connect is present
    const manageLink = page.locator("#manage-connect-servers-link");
    await expect(manageLink).toBeVisible();
    await manageLink.click();
    await expect(page).toHaveURL("http://localhost:3000/guilds");
  });

  test("6. Phase 6A Mobile Responsive: drawer navigation works on mobile viewport", async ({
    page,
    context,
    request,
  }) => {
    const runId = String(Date.now());
    const discordUserId = `99${runId.padStart(16, "0").slice(-16)}`;
    const testGuildId = `90${runId.padStart(16, "0").slice(-16)}`;

    await request.post(`${API_BASE_URL}/internal/test/discord/guilds`, {
      data: {
        discordUserId,
        guilds: [{ id: testGuildId, name: "Mobile Discord Guild" }],
      },
    });

    const sessionRes = await request.post(`${API_BASE_URL}/internal/test/session`, {
      data: {
        discordUserId,
        name: "Mobile Tester",
      },
    });
    const sessionData = await sessionRes.json();

    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: sessionData.cookieValue,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    // Set mobile viewport (iPhone 12 / 13)
    await page.setViewportSize({ width: 390, height: 844 });

    // Connect guild and open overview
    await page.goto("/guilds");
    await page.locator(`#connect-guild-button-${testGuildId}`).click();
    await expect(page).toHaveURL(new RegExp(`/tenants/[^/]+/guilds/${testGuildId}$`));

    // Desktop sidebar should be hidden on mobile
    await expect(page.locator("#app-sidebar")).toHaveCount(0);

    // Click mobile sidebar trigger
    const trigger = page.locator('button[data-sidebar="trigger"]');
    await expect(trigger).toBeVisible();
    await trigger.click();

    // Drawer sheet should open with mobile nav
    const mobileSheet = page.locator('div[data-sidebar="sidebar"][data-mobile="true"]');
    await expect(mobileSheet).toBeVisible();
    await expect(mobileSheet.locator("#nav-guild-overview")).toBeVisible();
    await expect(mobileSheet.locator("#nav-bot-setup")).toBeVisible();
  });
});
