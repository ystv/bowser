import { Show } from "@bowser/prisma/client";
import {
  test as base,
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { add } from "date-fns";
import type { CompleteShowType } from "../../src/common/types";

export const test = base.extend<{
  app: [ElectronApplication, Page];
}>({
  // eslint-disable-next-line no-empty-pattern
  app: async ({}, use, testInfo) => {
    const app = await electron.launch({
      args: ["--enable-logging", ".vite/build/main.js"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        E2E_TEST: "true",
        __USE_MOCK_SERVER_API: "true",
        __USE_MOCK_VMIX: "true",
      },
    });

    const win = await app.firstWindow();

    await win.context().tracing.start({ screenshots: true, snapshots: true });

    await win.waitForLoadState("domcontentloaded");

    await app.evaluate(
      (_, testTime) => {
        __MOCK_SERVER_API__.mock("query", "ping", "pong");
        __MOCK_SERVER_API__.mock("query", "shows.listUpcoming", [
          {
            id: 1,
            name: "Test show",
            start: testTime,
            version: 1,
            ytBroadcastID: null,
            ytStreamID: null,
          },
        ] satisfies Show[]);
      },
      add(new Date(), { days: 1 }),
    );

    await win.getByLabel("Server address").fill("http://localhost:3000");
    await win.getByLabel("Server Password").fill("aaa");

    await win.getByRole("button", { name: "Connect" }).click();

    await expect(
      win.getByRole("heading", { name: "Select a show" }),
    ).toBeVisible();

    await use([app, win]);

    await win
      .context()
      .tracing.stop({ path: `traces/${testInfo.title}-${testInfo.retry}.zip` });

    await expect(
      app.evaluate(({ ipcMain }) => ipcMain.emit("resetTestSettings")),
    ).not.toBe(false);

    await win.close();
    await app.close();
  },
});

declare global {
  // eslint-disable-next-line no-var
  var __MOCK_SERVER_API__: {
    mock: (
      type: "query" | "mutation",
      name: string,
      returnValue: unknown,
    ) => void;
    reset: () => void;
  };
}

test.afterEach(async ({ app: [app] }) => {
  await app.evaluate(() => {
    globalThis.__MOCK_SERVER_API__.reset();
  });
});

test("it works", async ({ app: [app, page] }) => {
  await page.getByText("Test show").click();
});

test("scrolling for a show with lots of rundown items", async ({
  app: [app, page],
}) => {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.emit("doIPCMutation", {}, "devtools.setSettings", {
      enabled: true,
    });
  });
  await app.evaluate(
    ({ ipcMain }, testTime) => {
      ipcMain.emit("doIPCMutation", {}, "devtools.setEnabledIntegrations", [
        "obs",
        "ontime",
        "vmix",
      ]);
      __MOCK_SERVER_API__.mock("query", "integrations.status", {
        obs: "enabled",
      });
      __MOCK_SERVER_API__.mock("query", "shows.getVersion", { version: 1 });
      __MOCK_SERVER_API__.mock("query", "shows.get", {
        id: 1,
        name: "Test show",
        start: testTime,
        version: 1,
        rundowns: [
          {
            id: 1,
            name: "Rundown 1",
            order: 0,
            assets: [],
            items: new Array(50).fill(null).map((_, i) => ({
              id: i,
              type: "VT",
              notes: "",
              rundownId: 1,
              name: `Item ${i}`,
              durationSeconds: 0,
              order: i,
              showId: 1,
              ytBroadcastID: null,
              mediaId: 1,
              media: {
                id: 1,
                durationSeconds: 0,
                name: "Test media",
                path: "",
                rawPath: "",
                state: "Ready",
              },
            })),
            showId: 1,
            ytBroadcastID: null,
          },
        ],
        continuityItems: [],
        ytBroadcastID: null,
        ytStreamID: null,
      } satisfies CompleteShowType);
    },
    add(new Date(), { days: 1 }),
  );
  await page.getByRole("button", { name: "Select" }).click();

  await page.getByText("Continuity").click();
  await page.getByRole("menuitem", { name: "Rundown 1" }).click();

  await page.getByRole("cell", { name: "Item 40" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("cell", { name: "Item 40" })).toBeInViewport();
});
