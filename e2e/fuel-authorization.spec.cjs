const { chromium } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  try {
    await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Acesse sua conta" }).waitFor();
    await page.getByLabel("E-mail").fill("fleetwise-e2e@example.test");
    await page.getByLabel("Senha").fill("E2E-Only-Password-2026!");
    await page.getByRole("button", { name: "Entrar com segurança" }).click();

    await page.getByRole("button", { name: "Abastecimentos" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Dar baixa em autorização/ }).click();
    await page.getByLabel("Autorização em aberto *").selectOption({
      label: /E2E-AUTH-001/
    }).catch(async () => {
      // Playwright selectOption does not accept a RegExp in the label field.
      const option = page.locator('select').filter({ has: page.locator('option', { hasText: "E2E-AUTH-001" }) });
      const value = await option.locator('option', { hasText: "E2E-AUTH-001" }).getAttribute("value");
      assert.ok(value, "E2E authorization option must be available");
      await page.getByLabel("Autorização em aberto *").selectOption(value);
    });

    await page.getByLabel("Litros *").fill("51");
    await page.getByLabel("Preço por litro (R$) *").fill("10.00");
    await page.getByLabel(/Odômetro \(km\)/).fill("1000");
    await page.getByRole("button", { name: "Dar baixa e registrar abastecimento" }).click();
    await page.getByRole("alert").filter({ hasText: "ultrapassa o limite da autorização" }).waitFor();
    assert.equal(await page.getByRole("alert").count(), 1, "over-limit fueling should be rejected before submission");

    await page.getByLabel("Litros *").fill("30");
    await page.getByRole("button", { name: "Dar baixa e registrar abastecimento" }).click();
    await page.getByRole("status").filter({ hasText: "Baixa da autorização registrada" }).waitFor({ timeout: 15000 });

    await page.getByText("30", { exact: false }).first().waitFor();
    assert.deepEqual(consoleErrors, [], "the app should not throw uncaught browser errors");
    console.log("PASS: login, organization membership, authorization selection, client-side limit rejection, valid settlement, and browser runtime checks.");
  } catch (error) {
    await page.screenshot({ path: "test-results/fuel-authorization-failure.png", fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})();
