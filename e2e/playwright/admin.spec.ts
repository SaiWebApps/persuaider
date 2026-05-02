import { test, expect } from '@playwright/test';
import { loginAsDemo, loginAsAdmin } from './helpers';

test('non-admin is redirected from admin pages', async ({ page }) => {
  await loginAsDemo(page);
  await page.goto('/admin/users');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  expect(page.url()).toContain('/dashboard');
});

test('admin can access admin panel and see user table', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users');
  await expect(page.locator('h1:has-text("Users"), h2:has-text("Users")').first()).toBeVisible();
  await expect(page.locator('table')).toBeVisible();
  await expect(page.locator('td:has-text("demo@persuaider.com")')).toBeVisible();
  await expect(page.locator('td:has-text("admin@persuaider.local")')).toBeVisible();
});

test('admin can create a user account', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users');

  await page.locator('main button:has-text("Create User"), [data-testid="create-user-btn"]').first().click();

  const timestamp = Date.now();
  const email = `testuser-${timestamp}@test.com`;
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="username"]').fill(`Test User ${timestamp}`);

  await page.locator('[role="dialog"] button:has-text("Create")').click();

  const passwordDisplay = page.locator('[data-testid="generated-password"]');
  await expect(passwordDisplay).toBeVisible({ timeout: 10000 });
  const password = await passwordDisplay.textContent();
  expect(password!.length).toBeGreaterThan(6);

  await page.locator('[role="dialog"] button:has-text("Close")').click();
  await expect(page.locator(`td:has-text("${email}")`)).toBeVisible();
});

test('admin can create a scenario with personas', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/scenarios');

  const scenarioName = `E2E Scenario ${Date.now()}`;

  await page.locator('main button:has-text("Create Scenario"), [data-testid="create-scenario-btn"]').first().click();

  await page.locator('input[name="title"]').fill(scenarioName);
  await page.locator('textarea[name="description"]').fill('Created by Playwright test');
  await page.locator('input[name="userRole"]').fill('Tester');
  await page.locator('input[name="aiRole"]').fill('Subject');
  await page.locator('[role="dialog"] button:has-text("Next")').click();

  await page.locator('input[name="personaName"]').fill('E2E Persona');
  await page.locator('input[name="personaRoleType"]').fill('Skeptic');
  await page.locator('[role="dialog"] button:has-text("Next")').click();

  await expect(page.locator(`[role="dialog"]:has-text("${scenarioName}")`)).toBeVisible();
  await page.locator('[role="dialog"] button:has-text("Create Scenario")').click();

  await expect(page.locator(`h3:has-text("${scenarioName}")`)).toBeVisible({ timeout: 10000 });
});

test('admin link visible only for admin users', async ({ browser }) => {
  // Admin context: log in as admin, verify Admin link exists
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginAsAdmin(adminPage);
  await expect(adminPage.locator('a:has-text("Admin")')).toBeVisible();
  await adminContext.close();

  // Demo context: log in as demo user, verify Admin link does NOT exist
  const demoContext = await browser.newContext();
  const demoPage = await demoContext.newPage();
  await loginAsDemo(demoPage);
  await expect(demoPage.locator('a:has-text("Admin")')).toHaveCount(0);
  await demoContext.close();
});
