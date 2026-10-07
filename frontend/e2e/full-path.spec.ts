import type { Page, APIResponse } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import {
  type Actor,
  type TestStack,
  type PublicJob,
  syntheticPassword,
} from "./support/stack";
import { openJobStream } from "./support/sse";

async function data<T>(response: APIResponse, status = 200): Promise<T> {
  expect(response.status()).toBe(status);
  return (await response.json()).data;
}
async function login(page: Page, email: string, password = syntheticPassword) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function newChat(
  page: Page,
  stack: TestStack,
  actor: Actor,
  workspace: number,
) {
  const response = page.waitForResponse(
    (r) =>
      r.url() === `${stack.apiUrl}/chat` && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "New Chat", exact: true })
    .first()
    .click();
  const result = await response;
  expect(result.status()).toBe(201);
  const chat = (await result.json()).data as {
    id: number;
    workspaceId: number;
  };
  expect(chat.workspaceId).toBe(workspace);
  stack.trackChat(actor, workspace, chat.id);
  await expect(page.getByLabel("Model", { exact: true })).toBeEnabled();
  return chat;
}
async function send(
  page: Page,
  stack: TestStack,
  provider: "ollama" | "openai",
  prompt: string,
  gated = false,
) {
  await page
    .getByLabel("Model", { exact: true })
    .selectOption(`${stack.providers[provider].id}::e2e-${provider}`);
  await page.getByPlaceholder("Send a message").fill(prompt);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  if (gated) {
    await expect(
      page.getByText(`${provider}:e2e-${provider}:`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Stop", exact: true }),
    ).toBeVisible();
    stack.upstreams.release(prompt);
  }
  await expect(
    page.getByText(`${provider}:e2e-${provider}:${prompt}`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeVisible();
  expect(
    stack.upstreams.generations.some(
      (g) =>
        g.provider === provider &&
        g.model === `e2e-${provider}` &&
        g.stream === true &&
        g.messages.at(-1)?.content === prompt,
    ),
  ).toBe(true);
}
const selectChat = (page: Page, title: string) =>
  page.getByRole("button", { name: `Open ${title}`, exact: true }).click();

test("same-context tabs preserve workspace isolation, provider selection and persisted streams", async ({
  page,
  context,
  stack,
}) => {
  const { email, actor } = await stack.createUser();
  const personal = actor.user.personalWorkspace.id;
  await login(page, email);
  await expect(page).toHaveURL(
    new RegExp(`/workspaces/${personal}/chat/home$`),
  );
  const personalChat = await newChat(page, stack, actor, personal);
  await data(
    await stack.request(actor, personal, `/chat/${personalChat.id}`, "PUT", {
      title: "Personal E2E history",
    }),
  );
  await send(page, stack, "ollama", "personal-only-prompt");
  const second = await context.newPage();
  await second.goto(`/workspaces/${personal}/chat/home`);
  await selectChat(second, "Personal E2E history");
  await expect(
    second.getByText("ollama:e2e-ollama:personal-only-prompt", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Personal Workspace/ }).click();
  await page.getByRole("menuitem", { name: "Create New Workspace" }).click();
  await page.getByLabel("Workspace name").fill("Standard E2E workspace");
  const created = page.waitForResponse(
    (r) =>
      r.url() === `${stack.apiUrl}/workspaces` &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const createdResponse = await created;
  expect(createdResponse.status()).toBe(201);
  const workspace = (await createdResponse.json()).data as {
    id: number;
    type: string;
  };
  expect(workspace.type).toBe("STANDARD");
  stack.trackWorkspace(actor, workspace.id);
  await expect(page).toHaveURL(
    new RegExp(`/workspaces/${workspace.id}/chat/home$`),
  );
  const headers: string[] = [];
  page.on("request", (r) => {
    if (
      r.url().startsWith(`${stack.apiUrl}/chat`) ||
      r.url().startsWith(`${stack.apiUrl}/llm/models`)
    )
      headers.push(r.headers()["x-workspace-id"]);
  });
  const standardChat = await newChat(page, stack, actor, workspace.id);
  await data(
    await stack.request(
      actor,
      workspace.id,
      `/chat/${standardChat.id}`,
      "PUT",
      { title: "Standard E2E history" },
    ),
  );
  await send(page, stack, "openai", "gated-standard-only-prompt", true);
  expect(headers.length).toBeGreaterThan(0);
  expect(headers.every((value) => value === String(workspace.id))).toBe(true);
  await expect(second).toHaveURL(
    new RegExp(`/workspaces/${personal}/chat/home$`),
  );
  await expect(
    second.getByText("openai:e2e-openai:gated-standard-only-prompt", {
      exact: true,
    }),
  ).toHaveCount(0);
  const secondHeaders: string[] = [];
  second.on("request", (r) => {
    if (
      r.url().startsWith(`${stack.apiUrl}/chat`) ||
      r.url().startsWith(`${stack.apiUrl}/llm/models`)
    )
      secondHeaders.push(r.headers()["x-workspace-id"]);
  });
  await second.reload();
  await selectChat(second, "Personal E2E history");
  await expect(
    second.getByText("ollama:e2e-ollama:personal-only-prompt", { exact: true }),
  ).toBeVisible();
  expect(secondHeaders.length).toBeGreaterThan(0);
  expect(secondHeaders.every((value) => value === String(personal))).toBe(true);
  await page.reload();
  await selectChat(page, "Standard E2E history");
  await expect(
    page.getByText("openai:e2e-openai:gated-standard-only-prompt", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Standard E2E workspace/ }).click();
  await page.getByRole("menuitem", { name: /Personal Workspace/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`/workspaces/${personal}/chat/home$`),
  );
  await selectChat(page, "Personal E2E history");
  await send(page, stack, "openai", "personal-provider-switched");
  const personalMessages = await data(
    await stack.request(actor, personal, `/chat/${personalChat.id}/messages`),
  );
  const standardMessages = await data(
    await stack.request(
      actor,
      workspace.id,
      `/chat/${standardChat.id}/messages`,
    ),
  );
  expect(JSON.stringify(personalMessages)).toContain(
    "openai:e2e-openai:personal-provider-switched",
  );
  expect(JSON.stringify(personalMessages)).not.toContain(
    "standard-only-prompt",
  );
  expect(JSON.stringify(standardMessages)).toContain(
    "openai:e2e-openai:gated-standard-only-prompt",
  );
  expect(JSON.stringify(standardMessages)).not.toContain(
    "personal-only-prompt",
  );
});

test("cross-owner, wrong-workspace and admin access cannot expose or mutate private chat content", async ({
  browser,
  stack,
}) => {
  const owner = await stack.createUser();
  const other = await stack.createUser();
  const personal = owner.actor.user.personalWorkspace.id;
  const workspace = await data<{ id: number }>(
    await stack.request(owner.actor, personal, "/workspaces", "POST", {
      name: "Other owned workspace",
    }),
    201,
  );
  stack.trackWorkspace(owner.actor, workspace.id);
  const chat = await data<{ id: number }>(
    await stack.request(owner.actor, personal, "/chat", "POST", {
      title: "private-e2e-title",
    }),
    201,
  );
  stack.trackChat(owner.actor, personal, chat.id);
  await data(
    await stack.request(
      owner.actor,
      personal,
      `/chat/${chat.id}/generate`,
      "POST",
      {
        content: "private-e2e-prompt",
        providerId: stack.providers.ollama.id,
        model: "e2e-ollama",
      },
    ),
    201,
  );
  const before = await data(
    await stack.request(owner.actor, personal, `/chat/${chat.id}/messages`),
  );
  for (const [actor, header] of [
    [owner.actor, workspace.id],
    [other.actor, other.actor.user.personalWorkspace.id],
    [other.actor, personal],
    [stack.admin, stack.admin.user.personalWorkspace.id],
  ] as const) {
    for (const [endpoint, method, body] of [
      [`/chat/${chat.id}`, "GET", undefined],
      [`/chat/${chat.id}/messages`, "GET", undefined],
      [`/chat/${chat.id}`, "PUT", { title: "unauthorized" }],
      [`/chat/${chat.id}`, "DELETE", undefined],
      [`/chat/${chat.id}/generate`, "POST", { content: "unauthorized" }],
    ] as const) {
      const response = await stack.request(
        actor,
        header,
        endpoint,
        method,
        body,
      );
      expect(response.status()).toBe(404);
      expect(await response.text()).not.toMatch(
        /private-e2e|e2e-only-provider-key|synthetic-header/,
      );
    }
  }
  expect(
    await data(
      await stack.request(owner.actor, personal, `/chat/${chat.id}/messages`),
    ),
  ).toEqual(before);
  expect(
    await data<{ title: string }>(
      await stack.request(owner.actor, personal, `/chat/${chat.id}`),
    ),
  ).toMatchObject({ title: "private-e2e-title" });
  const otherContext = await browser.newContext({ baseURL: stack.frontendUrl });
  try {
    const otherPage = await otherContext.newPage();
    await login(otherPage, other.email);
    await expect(otherPage).toHaveURL(
      new RegExp(
        `/workspaces/${other.actor.user.personalWorkspace.id}/chat/home$`,
      ),
    );
    await otherPage.goto(`/workspaces/${personal}/chat/home`);
    await expect(otherPage).toHaveURL(
      new RegExp(
        `/workspaces/${other.actor.user.personalWorkspace.id}/chat/home$`,
      ),
    );
    await expect(
      otherPage.getByText("private-e2e-title", { exact: true }),
    ).toHaveCount(0);
    await login(otherPage, "admin@example.com", "Admin123!");
    await expect(otherPage).toHaveURL(/\/analytics\/dashboard$/);
    const summary = await data<{ generation: { total: number } }>(
      await stack.request(
        stack.admin,
        stack.admin.user.personalWorkspace.id,
        "/admin/analytics/summary",
      ),
    );
    expect(summary.generation.total).toBeGreaterThan(0);
    expect(JSON.stringify(summary)).not.toMatch(
      /private-e2e|e2e-only-provider-key|synthetic-header/,
    );
    await expect(
      otherPage.getByText("private-e2e-prompt", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});

test("authenticated job SSE follows real worker success and cancellation with owner-scoped access", async ({
  stack,
}) => {
  test.setTimeout(60_000);
  const admin = stack.admin;
  const personal = admin.user.personalWorkspace.id;
  const regular = await stack.createUser();
  const workspace = await data<{ id: number }>(
    await stack.request(admin, personal, "/workspaces", "POST", {
      name: "Job isolation workspace",
    }),
    201,
  );
  stack.trackWorkspace(admin, workspace.id);
  expect(
    (
      await stack.request(
        regular.actor,
        regular.actor.user.personalWorkspace.id,
        "/admin/system/validation-jobs",
        "POST",
        { mode: "success" },
      )
    ).status(),
  ).toBe(401);
  const success = await data<PublicJob>(
    await stack.request(
      admin,
      personal,
      "/admin/system/validation-jobs",
      "POST",
      { mode: "success" },
    ),
    202,
  );
  const cancel = await data<PublicJob>(
    await stack.request(
      admin,
      personal,
      "/admin/system/validation-jobs",
      "POST",
      { mode: "success" },
    ),
    202,
  );
  const streams: Awaited<ReturnType<typeof openJobStream>>[] = [];
  try {
    const successStream = await openJobStream(
      stack,
      admin,
      personal,
      success.id,
    );
    streams.push(successStream);
    const cancelStream = await openJobStream(stack, admin, personal, cancel.id);
    streams.push(cancelStream);
    expect(await successStream.next()).toMatchObject({
      event: "snapshot",
      data: { status: "QUEUED" },
    });
    expect(await cancelStream.next()).toMatchObject({
      event: "snapshot",
      data: { status: "QUEUED" },
    });
    for (const [actor, header] of [
      [admin, workspace.id],
      [regular.actor, regular.actor.user.personalWorkspace.id],
      [regular.actor, personal],
    ] as const) {
      for (const [suffix, method] of [
        ["", "GET"],
        ["/cancel", "POST"],
        ["/stream", "GET"],
      ] as const) {
        const response = await stack.request(
          actor,
          header,
          `/jobs/${success.id}${suffix}`,
          method,
        );
        expect(response.status()).toBe(404);
        expect(await response.text()).not.toContain("checksum");
      }
    }
    expect(
      await data(
        await stack.request(
          admin,
          personal,
          `/jobs/${cancel.id}/cancel`,
          "POST",
        ),
      ),
    ).toMatchObject({ status: "CANCEL_REQUESTED" });
    await stack.startWorker();
    const [completed, cancelled] = await Promise.all([
      successStream.terminal(),
      cancelStream.terminal(),
    ]);
    expect(completed).toMatchObject({
      event: "succeeded",
      data: {
        status: "SUCCEEDED",
        progress: 100,
        result: {
          iterations: 25000,
          checksum:
            "cec28d83362a96f97751981f0db822a82eb53043fb1abb75039ac76cfbee7483",
        },
      },
    });
    expect(cancelled).toMatchObject({
      event: "cancelled",
      data: { status: "CANCELLED" },
    });
    expect(
      await data(await stack.request(admin, personal, `/jobs/${success.id}`)),
    ).toMatchObject({ status: "SUCCEEDED" });
    expect(
      await data(await stack.request(admin, personal, `/jobs/${cancel.id}`)),
    ).toMatchObject({ status: "CANCELLED" });
    await expect
      .poll(() => stack.db.jobMetric.count({ where: { jobId: success.id } }))
      .toBe(1);
  } finally {
    await Promise.all(streams.map((stream) => stream.close()));
  }
  // No ordinary-user enqueue API exists. These test-only rows exercise existing owner APIs.
  const fixture = {
    workspaceId: regular.actor.user.personalWorkspace.id,
    createdByUserId: regular.actor.user.id,
    type: "e2e.fixture",
    maxAttempts: 1,
  };
  const terminal = await stack.db.job.create({
    data: {
      ...fixture,
      status: "SUCCEEDED",
      progress: 100,
      stage: "fixture_done",
      completedAt: new Date(),
    },
  });
  const queued = await stack.db.job.create({
    data: { ...fixture, status: "QUEUED", stage: "fixture_queued" },
  });
  const ownedJob = await data(
    await stack.request(
      regular.actor,
      fixture.workspaceId,
      `/jobs/${terminal.id}`,
    ),
  );
  expect(ownedJob).toMatchObject({ status: "SUCCEEDED" });
  expect(ownedJob).not.toHaveProperty("payload");
  expect(ownedJob).not.toHaveProperty("queueMessageId");
  expect(
    await data(
      await stack.request(
        regular.actor,
        fixture.workspaceId,
        `/jobs/${queued.id}/cancel`,
        "POST",
      ),
    ),
  ).toMatchObject({ status: "CANCEL_REQUESTED" });
  const stream = await openJobStream(
    stack,
    regular.actor,
    fixture.workspaceId,
    terminal.id,
  );
  try {
    expect(await stream.next()).toMatchObject({
      event: "snapshot",
      data: { status: "SUCCEEDED" },
    });
    expect(await stream.terminal()).toMatchObject({ event: "succeeded" });
  } finally {
    await stream.close();
  }
});
