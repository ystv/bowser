import { test as base, expect, Page } from "@playwright/test";

const test = base.extend<{ showPage: Page }>({
  showPage: async ({ page, request }, use) => {
    await request.post("/api/resetDBInTestsDoNotUseOrYouWillBeFired");

    await page.goto("/shows/create");
    await page.getByLabel("Name").fill("Test Show");
    await page.getByLabel("Start").click();
    await page.getByText("27").click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(
      page.getByRole("heading", { name: "Test Show" }),
    ).toBeVisible();

    await use(page);
    await request.post("/api/resetDBInTestsDoNotUseOrYouWillBeFired");
  },
});

test("add, reorder, remove items", async ({ showPage }) => {
  await expect
    .soft(showPage.getByTestId("ShowItemsList.runtime"))
    .toHaveText("Total runtime: 00:00");

  await showPage.getByRole("button", { name: "New Rundown" }).click();
  await showPage.getByTestId("name-rundown").fill("Test 1");
  await showPage.getByTestId("create-rundown").click();
  await showPage.getByRole("button", { name: "New Continuity Item" }).click();
  await showPage.getByTestId("name-continuity_item").fill("Test 2");
  await showPage.getByTestId("create-continuity_item").click();
  await showPage.getByRole("button", { name: "New Rundown" }).click();
  await showPage.getByTestId("name-rundown").fill("Test 3");
  await showPage.getByTestId("create-rundown").click();
  await showPage.keyboard.press("Escape");

  const table = await showPage.getByTestId("ShowItemsList.itemsTable");
  await expect(table.locator("tr")).toHaveCount(3);

  await showPage.getByTestId("dragHandle").nth(0).hover();
  await showPage.mouse.down();
  await showPage.mouse.move(0, 400, { steps: 10 });
  await showPage.mouse.up();
  await expect(
    showPage.getByRole("row").nth(3).getByTestId("RundownRow.name"),
  ).toHaveText("Test 1");

  await showPage.getByRole("button", { name: "Delet" }).nth(2).click();
  await showPage.getByRole("button", { name: "You sure boss?" }).click();
  await showPage.getByRole("dialog").waitFor({ state: "hidden" });

  await showPage.getByRole("button", { name: "Delet" }).nth(1).click();
  await showPage.getByRole("button", { name: "You sure boss?" }).click();
  await showPage.getByRole("dialog").waitFor({ state: "hidden" });

  await showPage.getByRole("button", { name: "Delet" }).click();
  await showPage.getByRole("button", { name: "You sure boss?" }).click();
  await showPage.getByRole("dialog").waitFor({ state: "hidden" });

  await expect(table.locator("tr")).toHaveCount(0);
});
