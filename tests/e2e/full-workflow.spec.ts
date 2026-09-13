import { expect, test, type Page } from "@playwright/test";

const password = "RepairFlow!2026";
const appOrigin = "http://127.0.0.1:3100";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
}

test("three roles complete, close and reopen a repair with record isolation", async ({ page }) => {
  test.setTimeout(60_000);

  const title = `[e2e] Bathroom leak ${Date.now()}`;
  const invitationEmail = `e2e-contractor-${Date.now()}@repairflow.test`;

  await login(page, "alex@repairflow.test");
  await page.goto("/submit");
  await page.getByLabel("Short title").fill(title);
  await page.getByLabel("Location in the property").fill("Bathroom");
  await page.getByLabel("What is happening?").fill("Water is dripping below the bathroom basin since this morning.");
  await page.getByLabel("When can someone attend?").fill("Weekdays after 3 pm");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("Request submitted", { exact: true })).toBeVisible();
  const ticketId = new URL(page.url()).pathname.split("/").at(-1)!;

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await page.locator('input[type="file"]').setInputFiles({ name: "evidence.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Upload photo" }).click();
  await expect(page.getByText("Photo uploaded")).toBeVisible();
  const attachmentPath = await page.getByRole("link", { name: "evidence.png" }).getAttribute("href");
  expect(attachmentPath).toBeTruthy();
  await logout(page);

  await login(page, "priya@repairflow.test");
  expect((await page.request.get(`/api/tickets/${ticketId}`)).status()).toBe(404);
  expect((await page.request.get(attachmentPath!)).status()).toBe(404);
  const aiResponse = await page.request.post(`/api/tickets/${ticketId}/ai`, { headers: { Origin: appOrigin }, data: { kind: "EXTRACTION" } });
  expect(aiResponse.status()).toBe(404);
  await page.goto(`/tickets?query=${encodeURIComponent(title)}`);
  await expect(page.getByText(title)).toHaveCount(0);
  await logout(page);

  await login(page, "manager@repairflow.test");
  await page.goto("/members");
  await page.getByLabel("Email").fill(invitationEmail);
  await page.getByLabel("Role").selectOption("CONTRACTOR");
  await page.getByRole("button", { name: "Create one-time link" }).click();
  await expect(page.getByText("One-time invitation created")).toBeVisible();
  const pendingInvitation = page.locator(".management-row").filter({ hasText: invitationEmail });
  await expect(pendingInvitation).toBeVisible();
  await pendingInvitation.getByRole("button", { name: "Revoke" }).click();
  await expect(pendingInvitation).toHaveCount(0);
  await page.goto(`/tickets/${ticketId}`);
  await page.getByRole("button", { name: "Save triage decision" }).click();
  await page.getByLabel(/Available in/).selectOption({ label: "Sam Rivera · Plumbing, Water damage" });
  await page.getByRole("button", { name: "Assign contractor" }).click();
  await expect(page.getByText("Contractor assigned")).toBeVisible();
  await logout(page);

  await login(page, "sam@repairflow.test");
  await page.goto(`/tickets/${ticketId}`);
  await page.getByLabel("Amount (AUD)").fill("245.50");
  await page.getByLabel("Scope of work").fill("Replace basin trap and reseal the waste fitting.");
  await page.getByRole("button", { name: "Submit quote" }).click();
  await expect(page.getByText("Quote submitted")).toBeVisible();
  await logout(page);

  await login(page, "manager@repairflow.test");
  await page.goto(`/tickets/${ticketId}`);
  await page.getByLabel(/Response note/).fill("Please include isolation valve inspection.");
  await page.getByRole("button", { name: "Request revision" }).click();
  await expect(page.getByText("Quote revision requested")).toBeVisible();
  await logout(page);

  await login(page, "sam@repairflow.test");
  await page.goto(`/tickets/${ticketId}`);
  await page.getByLabel("Amount (AUD)").fill("275.00");
  await page.getByLabel("Scope of work").fill("Replace basin trap, reseal waste fitting and inspect isolation valve.");
  await page.getByRole("button", { name: "Submit revised quote" }).click();
  await logout(page);

  await login(page, "manager@repairflow.test");
  await page.goto(`/tickets/${ticketId}`);
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(page.getByText("Appointment saved; confirmations reset")).toBeVisible();
  await logout(page);

  await login(page, "alex@repairflow.test");
  await page.goto(`/tickets/${ticketId}`);
  await page.getByRole("button", { name: "Confirm appointment" }).click();
  await logout(page);

  await login(page, "sam@repairflow.test");
  await page.goto(`/tickets/${ticketId}`);
  await page.getByRole("button", { name: "Confirm appointment" }).click();
  await page.getByRole("button", { name: "Start work" }).click();
  await page.getByLabel("Completion notes").fill("Replaced the trap, resealed the fitting and tested with no leaks found.");
  await page.getByLabel("Actual cost").fill("268.40");
  await page.getByRole("button", { name: "Send for tenant confirmation" }).click();
  await logout(page);

  await login(page, "alex@repairflow.test");
  await page.goto(`/tickets/${ticketId}`);
  await page.getByRole("button", { name: "Confirm repair and close" }).click();
  await expect(page.getByText("Closed", { exact: true })).toBeVisible();
  await page.getByLabel("Reason to reopen").fill("A small drip returned during the evening.");
  await page.getByRole("button", { name: "Reopen work order" }).click();
  await expect(page.getByText("Triaged", { exact: true })).toBeVisible();
});

test("unauthenticated and invalid attachment requests are rejected", async ({ page }) => {
  expect((await page.request.get("/api/tickets/demo-ticket-101")).status()).toBe(401);
  await login(page, "alex@repairflow.test");
  await page.goto("/tickets/demo-ticket-101");
  await page.locator('input[type="file"]').setInputFiles({ name: "unsafe.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg><script>alert(1)</script></svg>") });
  const responsePromise = page.waitForResponse((response) => response.url().includes("/attachments") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Upload photo" }).click();
  expect((await responsePromise).status()).toBe(415);
});
