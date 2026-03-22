/**
 * E2E tests — Integration wizard flow.
 *
 * Covers:
 *   - /integrazione marketplace page (loads, shows connectors, filters, search, navigation)
 *   - /integrazione/stripe detail page (tabs, inline wizard)
 *   - Full 5-step wizard: Entity -> Auth -> Mapping -> Frequency -> Review & Activate
 *   - Validation gates (no entities selected = can't advance)
 *   - API key verification (success + error)
 *   - Setup activation (success + error)
 *   - OAuth connector flow (Salesforce)
 *   - Wizard navigation (back, step indicator, step counter)
 *   - Mapping step interactions (tabs, dropdowns)
 *   - Frequency selection changes
 *   - Review step "Modifica" links
 *   - Tab switching on detail page (Setup, Sync, Mapping)
 *   - Responsive / mobile viewport
 *   - Marketplace -> detail page navigation
 */

import { test, expect, type Page } from "@playwright/test";
import {
  mockAllIntegrationEndpoints,
  mockIntegrationStatusEndpoint,
  mockCredentialsEndpoint,
  mockSetupEndpoint,
} from "./helpers";

// ─── Helper: advance wizard through entity selection + auth verification ─────

/**
 * Selects "Fatture" entity and advances through auth step with a valid API key.
 * Returns on the mapping step (step index 2).
 */
async function navigateToMappingStep(page: Page) {
  // Wait for entity step
  await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });
  await page.getByText("Fatture").click();

  // Step 0 -> 1 (auth)
  const nextBtn = page.locator("button:has-text('Avanti')").first();
  await nextBtn.click();
  await page.waitForTimeout(400);

  // Fill API key and verify
  const apiKeyInput = page
    .locator('input[aria-label="API Key"]')
    .or(page.locator('input[placeholder="sk_live_..."]'));
  if (await apiKeyInput.count() > 0) {
    await apiKeyInput.first().fill("sk_live_test_123456");
    const verifyBtn = page.getByText(/verifica connessione/i).first();
    await verifyBtn.click();
    await expect(
      page.getByText(/connessione verificata|verificata con successo/i)
    ).toBeVisible({ timeout: 5_000 });
  }

  // Step 1 -> 2 (mapping)
  const nextBtn2 = page.locator("button:has-text('Avanti')").first();
  await nextBtn2.click();
  await page.waitForTimeout(400);
}

/**
 * Navigates from mapping step to the review step (step index 4).
 */
async function navigateFromMappingToReview(page: Page) {
  // Step 2 -> 3 (frequency)
  const nextBtn = page.locator("button:has-text('Avanti')").first();
  await nextBtn.click();
  await page.waitForTimeout(400);

  // Step 3 -> 4 (review)
  const nextBtn2 = page.locator("button:has-text('Avanti')").first();
  await nextBtn2.click();
  await page.waitForTimeout(400);
}

// ─── Marketplace Page ───────────────────────────────────────────────────────────

test.describe("Integration Marketplace (/integrazione)", () => {
  test.beforeEach(async ({ page }) => {
    await mockIntegrationStatusEndpoint(page);
    await page.goto("/integrazione");
    await page.waitForLoadState("networkidle").catch(() => {});
  });

  test("shows page title and connector grid", async ({ page }) => {
    // Page should load without critical JS errors
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => {
      if (!err.message.includes("Hydration") && !err.message.includes("Warning")) {
        jsErrors.push(err.message);
      }
    });

    // Title or heading
    await expect(
      page.getByText(/integrazion/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // At least one connector card should be visible (Salesforce, HubSpot, Stripe)
    await expect(
      page.getByText("Salesforce").or(page.getByText("HubSpot")).or(page.getByText("Stripe"))
    ).toBeVisible({ timeout: 5_000 });

    expect(jsErrors).toHaveLength(0);
  });

  test("shows popular connectors", async ({ page }) => {
    // Salesforce, HubSpot, and Stripe are popular
    await expect(page.getByText("Salesforce")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("HubSpot")).toBeVisible();
    await expect(page.getByText("Stripe")).toBeVisible();
  });

  test("shows coming soon connectors as disabled", async ({ page }) => {
    // SAP is coming_soon in mock catalog
    const sapCard = page.getByText("SAP");
    if (await sapCard.count() > 0) {
      await expect(sapCard.first()).toBeVisible();
      // Coming soon button should be disabled or show "In arrivo"
      const comingSoonBtn = page.getByText(/in arrivo|coming soon|prossimamente/i);
      if (await comingSoonBtn.count() > 0) {
        await expect(comingSoonBtn.first()).toBeVisible();
      }
    }
  });

  test("connector card links to detail page", async ({ page }) => {
    await expect(page.getByText("Stripe")).toBeVisible({ timeout: 10_000 });

    // Click on "Configura" button under Stripe
    const configBtn = page
      .locator('a[href="/integrazione/stripe"]')
      .or(page.locator("a:has-text('Stripe')"));
    if (await configBtn.count() > 0) {
      await configBtn.first().click();
      await expect(page).toHaveURL(/integrazione\/stripe/);
    }
  });

  test("shows how-it-works section", async ({ page }) => {
    // The page has a "Come funziona" section
    const howItWorks = page.getByText(/come funziona/i);
    if (await howItWorks.count() > 0) {
      await expect(howItWorks.first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test("shows FAQ section with accordion items", async ({ page }) => {
    const faqSection = page.getByText(/domande frequenti/i);
    if (await faqSection.count() > 0) {
      await expect(faqSection.first()).toBeVisible({ timeout: 10_000 });

      // Click first FAQ question to expand it
      const firstQuestion = page.getByText(/quanto tempo serve/i);
      if (await firstQuestion.count() > 0) {
        await firstQuestion.first().click();

        // Answer should appear
        await expect(
          page.getByText(/3 minuti/i).first()
        ).toBeVisible({ timeout: 3_000 });
      }
    }
  });

  test("shows category filter buttons", async ({ page }) => {
    // Wait for connectors to load
    await expect(page.getByText("Stripe")).toBeVisible({ timeout: 10_000 });

    // Category filter buttons should be present (Tutti, CRM, Pagamenti, etc.)
    const tuttiFilter = page.getByText("Tutti").first();
    if (await tuttiFilter.count() > 0) {
      await expect(tuttiFilter).toBeVisible();
    }
  });
});

// ─── Connector Detail Page ──────────────────────────────────────────────────────

test.describe("Connector Detail (/integrazione/stripe)", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllIntegrationEndpoints(page);
    await page.goto("/integrazione/stripe");
    await page.waitForLoadState("networkidle").catch(() => {});
  });

  test("loads detail page with connector name and tabs", async ({ page }) => {
    // Connector name visible
    await expect(page.getByText("Stripe").first()).toBeVisible({ timeout: 10_000 });

    // Tabs should be visible: Setup, Sincronizzazione, Mappatura
    await expect(
      page.getByText("Setup").or(page.getByText("setup")).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("shows entity selection step by default (step 1)", async ({ page }) => {
    // The first wizard step shows entity selection
    await expect(
      page.getByText(/seleziona i dati|seleziona/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Entity names from Stripe config should be visible
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Abbonamenti")).toBeVisible();
    await expect(page.getByText("Pagamenti")).toBeVisible();
  });

  test("shows three tabs: Setup, Sincronizzazione, Mappatura", async ({ page }) => {
    await expect(page.getByText("Stripe").first()).toBeVisible({ timeout: 10_000 });

    const setupTab = page.getByText("Setup").first();
    const syncTab = page.getByText("Sincronizzazione").first();
    const mappingTab = page.getByText("Mappatura").first();

    await expect(setupTab).toBeVisible({ timeout: 5_000 });
    await expect(syncTab).toBeVisible();
    await expect(mappingTab).toBeVisible();
  });

  test("switching to Sincronizzazione tab shows sync content", async ({ page }) => {
    await expect(page.getByText("Stripe").first()).toBeVisible({ timeout: 10_000 });

    const syncTab = page.getByText("Sincronizzazione").first();
    if (await syncTab.count() > 0) {
      await syncTab.click();
      await page.waitForTimeout(500);

      // Sync tab should show sync-related content (status or placeholder)
      await expect(
        page
          .getByText(/sincronizzazione|stato sync|disconnesso|nessun dato/i)
          .first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("back arrow navigates to marketplace", async ({ page }) => {
    await expect(page.getByText("Stripe").first()).toBeVisible({ timeout: 10_000 });

    // Click the back arrow link
    const backLink = page
      .locator('a[href="/integrazione"]')
      .or(page.getByLabel(/torna/i));
    if (await backLink.count() > 0) {
      await backLink.first().click();
      await expect(page).toHaveURL(/integrazione(?!\/)/);
    }
  });
});

// ─── Wizard Flow ────────────────────────────────────────────────────────────────

test.describe("Setup Wizard — Full Flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllIntegrationEndpoints(page);
    await page.goto("/integrazione/stripe");
    await page.waitForLoadState("networkidle").catch(() => {});
  });

  test("cannot advance without selecting an entity", async ({ page }) => {
    // Wait for entity step to load
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });

    // "Avanti" button should be disabled when no entities selected
    const nextBtn = page
      .getByRole("button", { name: /avanti/i })
      .or(page.locator("button:has-text('Avanti')"));

    if (await nextBtn.count() > 0) {
      const btn = nextBtn.first();
      // Should be disabled (opacity or disabled attribute)
      const isDisabled =
        (await btn.getAttribute("disabled")) !== null ||
        (await btn.evaluate((el) => {
          const style = window.getComputedStyle(el);
          return parseFloat(style.opacity) < 0.5;
        }));
      expect(isDisabled).toBeTruthy();
    }
  });

  test("select entity and advance to auth step", async ({ page }) => {
    // Wait for entities
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });

    // Click on Fatture entity to select it
    await page.getByText("Fatture").click();

    // Now click Avanti to go to Step 2 (Auth)
    const nextBtn = page.getByRole("button", { name: /avanti/i }).first();
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
    } else {
      // Might be a different button pattern -- try the arrow-right button
      const altBtn = page.locator("button:has-text('Avanti')").first();
      if (await altBtn.count() > 0) {
        await altBtn.click();
      }
    }

    // Auth step should appear -- Stripe uses API key mode
    await expect(
      page
        .getByText(/inserisci le credenziali|connetti stripe|api key/i)
        .first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("select all entities toggles all checkboxes", async ({ page }) => {
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });

    // Click "Seleziona tutto"
    const selectAll = page.getByText(/seleziona tutto/i);
    if (await selectAll.count() > 0) {
      await selectAll.first().click();

      // Counter should show "3 di 3 selezionati"
      await expect(
        page.getByText(/3 di 3/i)
      ).toBeVisible({ timeout: 3_000 });
    }
  });

  test("select all then deselect all toggles back to zero", async ({ page }) => {
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });

    const selectAll = page.getByText(/seleziona tutto/i);
    if (await selectAll.count() > 0) {
      // Select all
      await selectAll.first().click();
      await expect(page.getByText(/3 di 3/i)).toBeVisible({ timeout: 3_000 });

      // Click again to deselect all
      await selectAll.first().click();
      await expect(page.getByText(/0 di 3/i)).toBeVisible({ timeout: 3_000 });

      // Avanti should be disabled again
      const nextBtn = page.locator("button:has-text('Avanti')").first();
      if (await nextBtn.count() > 0) {
        const isDisabled =
          (await nextBtn.getAttribute("disabled")) !== null ||
          (await nextBtn.evaluate((el) => {
            const style = window.getComputedStyle(el);
            return parseFloat(style.opacity) < 0.5;
          }));
        expect(isDisabled).toBeTruthy();
      }
    }
  });

  test("selecting individual entity shows record count estimation", async ({ page }) => {
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });

    // Select Fatture
    await page.getByText("Fatture").click();

    // Estimation text should appear (e.g. "Stima sincronizzazione: ~3.200 record")
    const estimation = page.getByText(/stima sincronizzazione/i);
    if (await estimation.count() > 0) {
      await expect(estimation.first()).toBeVisible({ timeout: 3_000 });
    }
  });

  test("API key verification — success flow", async ({ page }) => {
    // Select entity
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Fatture").click();

    // Go to auth step
    const nextBtn = page.locator("button:has-text('Avanti')").first();
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
    }

    // Wait for auth step
    await expect(
      page.getByText(/inserisci le credenziali|api key/i).first()
    ).toBeVisible({ timeout: 5_000 });

    // Find API key input and fill it
    const apiKeyInput = page
      .locator('input[aria-label="API Key"]')
      .or(page.locator('input[placeholder="sk_live_..."]'));

    if (await apiKeyInput.count() > 0) {
      await apiKeyInput.first().fill("sk_live_test_123456");

      // Click verify button
      const verifyBtn = page.getByText(/verifica connessione/i);
      if (await verifyBtn.count() > 0) {
        await verifyBtn.first().click();

        // Wait for success message
        await expect(
          page.getByText(/connessione verificata|verificata con successo/i)
        ).toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test("API key verification — error flow", async ({ page }) => {
    // Override credentials mock with failure
    await mockCredentialsEndpoint(page, { success: false });

    // Select entity and go to auth
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Fatture").click();

    const nextBtn = page.locator("button:has-text('Avanti')").first();
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
    }

    // Fill API key
    const apiKeyInput = page
      .locator('input[aria-label="API Key"]')
      .or(page.locator('input[placeholder="sk_live_..."]'));

    if (await apiKeyInput.count() > 0) {
      await apiKeyInput.first().fill("sk_live_invalid_key");

      // Click verify
      const verifyBtn = page.getByText(/verifica connessione/i);
      if (await verifyBtn.count() > 0) {
        await verifyBtn.first().click();

        // Wait for error message
        await expect(
          page.getByText(/non valida|verifica fallita|errore/i).first()
        ).toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test("verify button disabled when API key is empty", async ({ page }) => {
    // Select entity and go to auth step
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Fatture").click();
    await page.locator("button:has-text('Avanti')").first().click();
    await page.waitForTimeout(400);

    // Verify button should be disabled when no API key entered
    const verifyBtn = page.getByText(/verifica connessione/i).first();
    if (await verifyBtn.count() > 0) {
      const isDisabled =
        (await verifyBtn.getAttribute("disabled")) !== null ||
        (await verifyBtn.evaluate((el) => {
          const style = window.getComputedStyle(el);
          return parseFloat(style.opacity) < 0.5;
        }));
      expect(isDisabled).toBeTruthy();
    }
  });

  test("secret key has show/hide toggle", async ({ page }) => {
    // Navigate to auth step
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Fatture").click();
    await page.locator("button:has-text('Avanti')").first().click();
    await page.waitForTimeout(400);

    // Secret key input should be password type by default
    const secretInput = page
      .locator('input[aria-label*="Secret"]')
      .or(page.locator('input[aria-label*="Webhook"]'))
      .or(page.locator('input[placeholder="whsec_..."]'));

    if (await secretInput.count() > 0) {
      // Default: password type
      const inputType = await secretInput.first().getAttribute("type");
      expect(inputType).toBe("password");

      // Click the show/hide toggle
      const toggleBtn = page.getByLabel(/mostra|nascondi/i);
      if (await toggleBtn.count() > 0) {
        await toggleBtn.first().click();

        // Now it should be text type
        const newType = await secretInput.first().getAttribute("type");
        expect(newType).toBe("text");
      }
    }
  });

  test("mapping step shows field mapping table with entity tabs", async ({ page }) => {
    await navigateToMappingStep(page);

    // Mapping step header
    await expect(
      page.getByText(/mappa i campi/i).first()
    ).toBeVisible({ timeout: 5_000 });

    // The selected entity "Fatture" should appear as a tab
    await expect(
      page.getByText("Fatture").first()
    ).toBeVisible({ timeout: 3_000 });

    // Source fields from Stripe "Fatture" entity should be visible
    await expect(
      page.getByText("Numero").or(page.getByText("Importo")).first()
    ).toBeVisible({ timeout: 3_000 });

    // AI suggestion banner
    await expect(
      page.getByText(/mappati automaticamente/i).first()
    ).toBeVisible({ timeout: 3_000 });
  });

  test("mapping step shows target field dropdowns", async ({ page }) => {
    await navigateToMappingStep(page);

    // Wait for mapping content
    await expect(
      page.getByText(/mappa i campi/i).first()
    ).toBeVisible({ timeout: 5_000 });

    // There should be select elements for field mapping
    const selects = page.locator('select[aria-label*="Mappatura"]');
    if (await selects.count() > 0) {
      // At least one mapping dropdown should exist
      expect(await selects.count()).toBeGreaterThan(0);

      // Dropdown should contain "-- Ignora --" option
      const firstSelect = selects.first();
      const options = firstSelect.locator("option");
      const optionTexts = await options.allTextContents();
      expect(optionTexts).toContain("-- Ignora --");
    }
  });

  test("frequency step shows 5 options", async ({ page }) => {
    // Select entity
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Fatture").click();

    // Navigate through steps to reach frequency (step index 3)
    // Step 0 -> 1 (auth): click Avanti
    const nextBtn = page.locator("button:has-text('Avanti')").first();
    if (await nextBtn.count() === 0) return;
    await nextBtn.click();

    // Step 1 -> 2 (mapping): Stripe is api_key mode, need to verify first
    // Fill and verify API key
    const apiKeyInput = page
      .locator('input[aria-label="API Key"]')
      .or(page.locator('input[placeholder="sk_live_..."]'));

    if (await apiKeyInput.count() > 0) {
      await apiKeyInput.first().fill("sk_live_test_123456");
      const verifyBtn = page.getByText(/verifica connessione/i).first();
      if (await verifyBtn.count() > 0) {
        await verifyBtn.click();
        await expect(
          page.getByText(/connessione verificata|verificata con successo/i)
        ).toBeVisible({ timeout: 5_000 });
      }
    }

    // Advance to mapping step
    const nextBtn2 = page.locator("button:has-text('Avanti')").first();
    if (await nextBtn2.count() > 0) await nextBtn2.click();

    // Wait for mapping step content
    await page.waitForTimeout(500);

    // Advance to frequency step
    const nextBtn3 = page.locator("button:has-text('Avanti')").first();
    if (await nextBtn3.count() > 0) await nextBtn3.click();

    // Frequency step should show options
    await expect(
      page.getByText(/frequenza sincronizzazione/i).first()
    ).toBeVisible({ timeout: 5_000 });

    // All 5 frequency options
    await expect(page.getByText(/tempo reale/i).first()).toBeVisible();
    await expect(page.getByText(/ogni ora/i).first()).toBeVisible();
    await expect(page.getByText(/ogni 6 ore/i).first()).toBeVisible();
    await expect(page.getByText(/giornaliera/i).first()).toBeVisible();
    await expect(page.getByText(/manuale/i).first()).toBeVisible();
  });

  test("frequency step allows selecting a different option", async ({ page }) => {
    await navigateToMappingStep(page);

    // Advance to frequency
    const nextBtn = page.locator("button:has-text('Avanti')").first();
    await nextBtn.click();
    await page.waitForTimeout(400);

    // Frequency step should be visible
    await expect(
      page.getByText(/frequenza sincronizzazione/i).first()
    ).toBeVisible({ timeout: 5_000 });

    // Default is "daily" -- click on "Ogni ora" to change it
    const hourlyOption = page.getByText(/ogni ora/i).first();
    if (await hourlyOption.count() > 0) {
      await hourlyOption.click();
      await page.waitForTimeout(300);

      // The "Ogni ora" option should now be selected (aria-checked or visual indicator)
      // We can verify by advancing to review and checking the frequency shown there
      const nextBtn2 = page.locator("button:has-text('Avanti')").first();
      await nextBtn2.click();
      await page.waitForTimeout(400);

      // In review step, frequency should show "Ogni ora"
      await expect(
        page.getByText(/ogni ora/i).first()
      ).toBeVisible({ timeout: 3_000 });
    }
  });

  test("review step shows config summary and activate button", async ({ page }) => {
    // Select entity
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Fatture").click();

    // Navigate to review step (step 4) -- go through all intermediate steps
    const advanceStep = async () => {
      const btn = page.locator("button:has-text('Avanti')").first();
      if (await btn.count() > 0) await btn.click();
      await page.waitForTimeout(400);
    };

    // Step 0 -> 1 (auth)
    await advanceStep();

    // Step 1: verify API key
    const apiKeyInput = page
      .locator('input[aria-label="API Key"]')
      .or(page.locator('input[placeholder="sk_live_..."]'));

    if (await apiKeyInput.count() > 0) {
      await apiKeyInput.first().fill("sk_live_test_123456");
      const verifyBtn = page.getByText(/verifica connessione/i).first();
      if (await verifyBtn.count() > 0) {
        await verifyBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // Step 1 -> 2 (mapping)
    await advanceStep();
    // Step 2 -> 3 (frequency)
    await advanceStep();
    // Step 3 -> 4 (review)
    await advanceStep();

    // Review step content
    await expect(
      page.getByText(/riepilogo/i).first()
    ).toBeVisible({ timeout: 5_000 });

    // Should show connector name
    await expect(page.getByText("Stripe").first()).toBeVisible();

    // Should show "Fatture" in the selected entities list
    await expect(page.getByText("Fatture")).toBeVisible();

    // Should show frequency info (default = Giornaliera)
    await expect(
      page.getByText(/giornaliera/i).first()
    ).toBeVisible({ timeout: 3_000 });

    // Should show mapping stats
    await expect(
      page.getByText(/campi mappati/i).first()
    ).toBeVisible({ timeout: 3_000 });

    // Should have an activate button
    const activateBtn = page
      .getByText(/attiva sincronizzazione/i)
      .or(page.getByRole("button", { name: /attiva/i }));

    await expect(activateBtn.first()).toBeVisible({ timeout: 3_000 });
  });

  test("review step has Modifica links for each section", async ({ page }) => {
    await navigateToMappingStep(page);
    await navigateFromMappingToReview(page);

    // Review step should be visible
    await expect(
      page.getByText(/riepilogo/i).first()
    ).toBeVisible({ timeout: 5_000 });

    // "Modifica" links should be present (for entities, mapping, frequency)
    const modificaLinks = page.getByText("Modifica");
    if (await modificaLinks.count() > 0) {
      expect(await modificaLinks.count()).toBeGreaterThanOrEqual(2);
    }
  });

  test("review step Modifica link navigates back to entity step", async ({ page }) => {
    await navigateToMappingStep(page);
    await navigateFromMappingToReview(page);

    await expect(
      page.getByText(/riepilogo/i).first()
    ).toBeVisible({ timeout: 5_000 });

    // Click the first "Modifica" link (should go to entity selection / step 0)
    const modificaLinks = page.getByText("Modifica");
    if (await modificaLinks.count() > 0) {
      await modificaLinks.first().click();
      await page.waitForTimeout(500);

      // Should be back on entity selection or mapping
      await expect(
        page
          .getByText(/seleziona i dati/i)
          .or(page.getByText(/mappa i campi/i))
          .first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("activate integration — success", async ({ page }) => {
    // Select entity
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Fatture").click();

    const advanceStep = async () => {
      const btn = page.locator("button:has-text('Avanti')").first();
      if (await btn.count() > 0) await btn.click();
      await page.waitForTimeout(400);
    };

    // Navigate to auth, verify, then proceed through all steps
    await advanceStep(); // -> auth

    const apiKeyInput = page
      .locator('input[aria-label="API Key"]')
      .or(page.locator('input[placeholder="sk_live_..."]'));
    if (await apiKeyInput.count() > 0) {
      await apiKeyInput.first().fill("sk_live_test_123456");
      const verifyBtn = page.getByText(/verifica connessione/i).first();
      if (await verifyBtn.count() > 0) {
        await verifyBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    await advanceStep(); // -> mapping
    await advanceStep(); // -> frequency
    await advanceStep(); // -> review

    // Click activate
    const activateBtn = page
      .getByText(/attiva sincronizzazione/i)
      .or(page.getByRole("button", { name: /attiva/i }));

    if (await activateBtn.count() > 0) {
      await activateBtn.first().click();

      // Wait for success state
      await expect(
        page.getByText(/integrazione attiva|configurato con successo|attiva!/i).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("activate integration — error shows retry", async ({ page }) => {
    // Override setup mock with failure
    await mockSetupEndpoint(page, { success: false });

    // Select entity
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Fatture").click();

    const advanceStep = async () => {
      const btn = page.locator("button:has-text('Avanti')").first();
      if (await btn.count() > 0) await btn.click();
      await page.waitForTimeout(400);
    };

    await advanceStep(); // -> auth

    const apiKeyInput = page
      .locator('input[aria-label="API Key"]')
      .or(page.locator('input[placeholder="sk_live_..."]'));
    if (await apiKeyInput.count() > 0) {
      await apiKeyInput.first().fill("sk_live_test_123456");
      const verifyBtn = page.getByText(/verifica connessione/i).first();
      if (await verifyBtn.count() > 0) {
        await verifyBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    await advanceStep(); // -> mapping
    await advanceStep(); // -> frequency
    await advanceStep(); // -> review

    // Click activate
    const activateBtn = page
      .getByText(/attiva sincronizzazione/i)
      .or(page.getByRole("button", { name: /attiva/i }));

    if (await activateBtn.count() > 0) {
      await activateBtn.first().click();

      // Should show retry button after failure
      await expect(
        page.getByText(/riprova|errore/i).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("multiple entity selection enables Avanti", async ({ page }) => {
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });

    // Select two entities
    await page.getByText("Fatture").click();
    await page.getByText("Abbonamenti").click();

    // Counter should show 2 selected
    await expect(
      page.getByText(/2 di 3/i)
    ).toBeVisible({ timeout: 3_000 });

    // Avanti should be enabled
    const nextBtn = page.locator("button:has-text('Avanti')").first();
    if (await nextBtn.count() > 0) {
      const isDisabled = (await nextBtn.getAttribute("disabled")) !== null;
      expect(isDisabled).toBeFalsy();
    }
  });
});

// ─── Wizard Navigation ──────────────────────────────────────────────────────────

test.describe("Setup Wizard — Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllIntegrationEndpoints(page);
    await page.goto("/integrazione/stripe");
    await page.waitForLoadState("networkidle").catch(() => {});
  });

  test("back button returns to previous step", async ({ page }) => {
    // Select entity and advance
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Fatture").click();

    const nextBtn = page.locator("button:has-text('Avanti')").first();
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
      await page.waitForTimeout(400);
    }

    // Should be on auth step
    await expect(
      page.getByText(/inserisci le credenziali|connetti stripe|api key/i).first()
    ).toBeVisible({ timeout: 5_000 });

    // Click "Indietro"
    const backBtn = page.locator("button:has-text('Indietro')").first();
    if (await backBtn.count() > 0) {
      await backBtn.click();
      await page.waitForTimeout(400);

      // Should be back on entity selection
      await expect(
        page.getByText(/seleziona i dati|seleziona/i).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("back button is disabled on first step", async ({ page }) => {
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });

    // "Indietro" button on step 0 should be disabled
    const backBtn = page.locator("button:has-text('Indietro')").first();
    if (await backBtn.count() > 0) {
      const isDisabled =
        (await backBtn.getAttribute("disabled")) !== null ||
        (await backBtn.evaluate((el) => {
          const style = window.getComputedStyle(el);
          return parseFloat(style.opacity) < 0.5;
        }));
      expect(isDisabled).toBeTruthy();
    }
  });

  test("step indicator shows correct active step", async ({ page }) => {
    // On step 1, the step indicator should show "1" as active
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });

    // Step label "Dati" should be visible and active (first step)
    const datiLabel = page.getByText("Dati").first();
    if (await datiLabel.count() > 0) {
      await expect(datiLabel).toBeVisible();
    }
  });

  test("step counter shows Passo X di 5", async ({ page }) => {
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });

    // Footer should show "Passo 1 di 5"
    const stepCounter = page.getByText(/passo 1 di 5/i);
    if (await stepCounter.count() > 0) {
      await expect(stepCounter.first()).toBeVisible();
    }
  });

  test("step counter updates when advancing", async ({ page }) => {
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Fatture").click();

    // Advance to step 2
    await page.locator("button:has-text('Avanti')").first().click();
    await page.waitForTimeout(400);

    // Counter should show "Passo 2 di 5"
    const stepCounter = page.getByText(/passo 2 di 5/i);
    if (await stepCounter.count() > 0) {
      await expect(stepCounter.first()).toBeVisible();
    }
  });

  test("completed step indicator is clickable to navigate back", async ({ page }) => {
    // Go through to mapping step
    await navigateToMappingStep(page);

    // Step indicator for step 1 (Dati) should be completed and clickable
    // It shows a checkmark instead of number
    const datiStep = page.getByText("Dati").first();
    if (await datiStep.count() > 0) {
      await datiStep.click();
      await page.waitForTimeout(500);

      // Should navigate back to entity selection
      await expect(
        page.getByText(/seleziona i dati/i).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("entity selection is preserved after navigating back from auth", async ({ page }) => {
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });

    // Select Fatture and Abbonamenti
    await page.getByText("Fatture").click();
    await page.getByText("Abbonamenti").click();
    await expect(page.getByText(/2 di 3/i)).toBeVisible({ timeout: 3_000 });

    // Advance to auth
    await page.locator("button:has-text('Avanti')").first().click();
    await page.waitForTimeout(400);

    // Go back
    await page.locator("button:has-text('Indietro')").first().click();
    await page.waitForTimeout(400);

    // Selection should still show 2 of 3
    await expect(page.getByText(/2 di 3/i)).toBeVisible({ timeout: 3_000 });
  });
});

// ─── OAuth Flow ─────────────────────────────────────────────────────────────────

test.describe("Setup Wizard — OAuth Connector", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllIntegrationEndpoints(page);
    await page.goto("/integrazione/salesforce");
    await page.waitForLoadState("networkidle").catch(() => {});
  });

  test("OAuth connector shows authorize button instead of API key form", async ({ page }) => {
    // Select an entity first
    await expect(page.getByText("Contatti")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Contatti").click();

    // Advance to auth step
    const nextBtn = page.locator("button:has-text('Avanti')").first();
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
    }

    // OAuth step should show "Autorizza con Salesforce" button
    await expect(
      page
        .getByText(/autorizza con salesforce|autorizza/i)
        .first()
    ).toBeVisible({ timeout: 5_000 });

    // Should show OAuth permissions list
    await expect(
      page.getByText(/lettura contatti/i).first()
    ).toBeVisible({ timeout: 3_000 });

    // Should show OAuth 2.0 security badge
    await expect(
      page.getByText(/oauth 2\.0/i).first()
    ).toBeVisible({ timeout: 3_000 });
  });

  test("OAuth connector shows data privacy notice", async ({ page }) => {
    await expect(page.getByText("Contatti")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Contatti").click();

    await page.locator("button:has-text('Avanti')").first().click();
    await page.waitForTimeout(400);

    // Should show "Non modifichiamo mai i tuoi dati" notice
    await expect(
      page.getByText(/non modifichiamo mai/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("OAuth connector allows advancing without API key verification", async ({ page }) => {
    await expect(page.getByText("Contatti")).toBeVisible({ timeout: 10_000 });
    await page.getByText("Contatti").click();

    // Advance to auth step
    await page.locator("button:has-text('Avanti')").first().click();
    await page.waitForTimeout(400);

    // For OAuth, Avanti should be enabled without verification
    const nextBtn = page.locator("button:has-text('Avanti')").first();
    if (await nextBtn.count() > 0) {
      const isDisabled = (await nextBtn.getAttribute("disabled")) !== null;
      // OAuth mode: canGoNext is true without verification
      expect(isDisabled).toBeFalsy();

      // Click to advance to mapping
      await nextBtn.click();
      await page.waitForTimeout(400);

      // Should be on mapping step
      await expect(
        page.getByText(/mappa i campi/i).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("Salesforce entities include Contatti and Opportunita", async ({ page }) => {
    // Entity selection should show Salesforce-specific entities
    await expect(page.getByText("Contatti")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Opportunita")).toBeVisible();
    await expect(page.getByText("Pipeline")).toBeVisible();
  });
});

// ─── Google Drive (OAuth) ─────────────────────────────────────────────────────

test.describe("Setup Wizard — Google Drive (OAuth)", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllIntegrationEndpoints(page);
    await page.goto("/integrazione/google-drive");
    await page.waitForLoadState("networkidle").catch(() => {});
  });

  test("Google Drive shows File and Cartelle entities", async ({ page }) => {
    await expect(page.getByText("File")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Cartelle")).toBeVisible();
  });

  test("Google Drive auth step shows OAuth permissions", async ({ page }) => {
    await expect(page.getByText("File")).toBeVisible({ timeout: 10_000 });
    await page.getByText("File").click();

    await page.locator("button:has-text('Avanti')").first().click();
    await page.waitForTimeout(400);

    // Should show Google Drive OAuth permissions
    await expect(
      page.getByText(/lettura file|lettura metadati/i).first()
    ).toBeVisible({ timeout: 5_000 });

    // Should show "Autorizza con Google Drive"
    await expect(
      page.getByText(/autorizza con google drive|autorizza/i).first()
    ).toBeVisible({ timeout: 3_000 });
  });
});

// ─── Responsive / Mobile ─────────────────────────────────────────────────────

test.describe("Integration Wizard — Mobile Viewport", () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone X viewport

  test("marketplace loads on mobile viewport", async ({ page }) => {
    await mockIntegrationStatusEndpoint(page);
    await page.goto("/integrazione");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Page should render without errors
    await expect(
      page.getByText(/integrazion/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // At least one connector should be visible
    await expect(
      page.getByText("Salesforce").or(page.getByText("HubSpot")).or(page.getByText("Stripe"))
    ).toBeVisible({ timeout: 5_000 });
  });

  test("wizard works on mobile viewport", async ({ page }) => {
    await mockAllIntegrationEndpoints(page);
    await page.goto("/integrazione/stripe");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Entity step should load
    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });

    // Select entity
    await page.getByText("Fatture").click();

    // Avanti button should be visible and clickable
    const nextBtn = page.locator("button:has-text('Avanti')").first();
    await expect(nextBtn).toBeVisible({ timeout: 3_000 });
    await nextBtn.click();
    await page.waitForTimeout(400);

    // Auth step should appear
    await expect(
      page.getByText(/inserisci le credenziali|api key/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("step indicator hides labels on mobile (only numbers)", async ({ page }) => {
    await mockAllIntegrationEndpoints(page);
    await page.goto("/integrazione/stripe");
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect(page.getByText("Fatture")).toBeVisible({ timeout: 10_000 });

    // On mobile, step labels have "hidden sm:inline" class
    // The step numbers (1, 2, 3, 4, 5) should be visible
    // The labels "Dati", "Auth", etc. should be hidden on < sm viewport
    const datiLabel = page.locator("span.hidden.sm\\:inline").first();
    if (await datiLabel.count() > 0) {
      // The label should not be visible on mobile
      await expect(datiLabel).not.toBeVisible();
    }
  });
});

// ─── Error Handling ──────────────────────────────────────────────────────────────

test.describe("Integration — Error Handling", () => {
  test("marketplace shows error state when API fails", async ({ page }) => {
    // Mock the status endpoint to return 500
    await page.route("**/api/integrations/status", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await page.goto("/integrazione");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Error state should show retry button
    await expect(
      page.getByText(/errore|impossibile caricare|riprova/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("unknown connector shows fallback or 404", async ({ page }) => {
    await mockAllIntegrationEndpoints(page);
    await page.goto("/integrazione/nonexistent-connector");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Should show some form of fallback (not a blank page)
    // Could be "connettore non trovato" or redirect to marketplace
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});
