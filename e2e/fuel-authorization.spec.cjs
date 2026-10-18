const { chromium } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ timezoneId: "America/Sao_Paulo" });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  try {
    await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Acesse sua conta" }).waitFor();
    await page.getByLabel("E-mail").fill("fleetwise-e2e@example.test");
    await page.getByLabel("Senha").fill("E2E-Only-Password-2026!");
    await page.getByRole("button", { name: "Entrar com segurança" }).click();

    await page.getByRole("button", { name: "Abastecimentos", exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Abastecimentos", exact: true }).click();
    await page.getByRole("heading", { name: "Controle de abastecimentos" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Dar baixa em autorização/ }).click();

    // datetime-local must represent local wall-clock time, not a UTC timestamp sliced into the input.
    const dateInput = page.getByLabel("Data e hora *");
    const dateValue = await dateInput.inputValue();
    assert.match(dateValue, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "local date/time input must be populated");
    assert.equal(
      await page.evaluate((value) => Math.abs(new Date(value).getTime() - Date.now()) < 120000, dateValue),
      true,
      "datetime-local default must be within two minutes of the actual local time"
    );

    const authorizationSelect = page.getByLabel("Autorização em aberto *");
    const litersAuthorization = await authorizationSelect.locator("option").filter({ hasText: "E2E-AUTH-001" }).getAttribute("value");
    const amountAuthorization = await authorizationSelect.locator("option").filter({ hasText: "E2E-AUTH-AMOUNT" }).getAttribute("value");
    assert.ok(litersAuthorization, "liters-limit E2E authorization must be available");
    assert.ok(amountAuthorization, "amount-limit E2E authorization must be available");
    await authorizationSelect.selectOption(litersAuthorization);

    await page.getByLabel("Litros *").fill("51");
    await page.getByLabel("Preço por litro (R$) *").fill("10.00");
    await page.getByLabel(/Odômetro \(km\)/).fill("1000");
    await page.getByRole("button", { name: "Dar baixa e registrar abastecimento" }).click();
    await page.getByRole("alert").filter({ hasText: "ultrapassa o limite da autorização" }).waitFor();
    assert.equal(await page.getByRole("alert").count(), 1, "over-limit liters fueling should be rejected before submission");

    // This authorization has enough liters but a monetary cap below the proposed total.
    await authorizationSelect.selectOption(amountAuthorization);
    await page.getByLabel("Litros *").fill("30");
    await page.getByLabel("Preço por litro (R$) *").fill("10.00");
    await page.getByRole("button", { name: "Dar baixa e registrar abastecimento" }).click();
    await page.getByRole("alert").filter({ hasText: "ultrapassa o valor autorizado" }).waitFor();

    // A valid settlement under both caps must persist exactly once.
    await authorizationSelect.selectOption(litersAuthorization);
    await page.getByLabel("Litros *").fill("30");
    await page.getByLabel("Preço por litro (R$) *").fill("10.00");
    await page.getByRole("button", { name: "Dar baixa e registrar abastecimento" }).click();
    await page.getByRole("status").filter({ hasText: "Baixa da autorização registrada" }).waitFor({ timeout: 15000 });

    await page.getByText("30", { exact: false }).first().waitFor();

    // Editing an existing fueling must preserve its local wall-clock time.
    await page.getByRole("button", { name: "Editar abastecimento" }).first().click();
    const editedDateValue = await page.getByLabel("Data e hora *").inputValue();
    assert.equal(
      await page.evaluate((value) => Math.abs(new Date(value).getTime() - Date.now()) < 120000, editedDateValue),
      true,
      "editing a fueling must restore the local date/time without a UTC offset shift"
    );
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    // Maintenance orders use the same datetime-local handling and need their own browser assertion.
    await page.getByRole("button", { name: "Manutenção", exact: true }).click();
    await page.getByRole("heading", { name: "Ordens de serviço" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Nova ordem", exact: true }).click();
    const maintenanceDateValue = await page.getByLabel("Data de abertura").inputValue();
    assert.match(maintenanceDateValue, /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/, "maintenance local date/time input must be populated");
    assert.equal(
      await page.evaluate((value) => Math.abs(new Date(value).getTime() - Date.now()) < 120000, maintenanceDateValue),
      true,
      "maintenance datetime-local default must be within two minutes of the actual local time"
    );
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    // Editing a seeded maintenance order must convert UTC to Sao Paulo local time.
    await page.getByRole("button", { name: "Editar E2E-OS-001", exact: true }).click();
    const editedMaintenanceDateValue = await page.getByLabel("Data de abertura").inputValue();
    assert.equal(
      editedMaintenanceDateValue,
      "2026-10-17T09:34",
      "editing a maintenance order must display 12:34 UTC as 09:34 in Sao Paulo"
    );
    await page.getByRole("button", { name: "Fechar", exact: true }).click();

    assert.deepEqual(consoleErrors, [], "the app should not throw uncaught browser errors");
    console.log("PASS: login, organization membership, local datetime defaults and editing, liters and amount cap rejection, valid settlement, maintenance datetime defaults and edit conversion, and browser runtime checks.");
  } catch (error) {
    await page.screenshot({ path: "test-results/fuel-authorization-failure.png", fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})();
