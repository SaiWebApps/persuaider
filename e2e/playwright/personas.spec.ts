import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers';

test('dashboard shows both demo scenarios', async ({ page }) => {
  await loginAsDemo(page);

  await expect(page.locator('h2:has-text("Salary Negotiation"), h3:has-text("Salary Negotiation"), section:has-text("Salary Negotiation")').first()).toBeVisible();
  const salaryCards = page.locator('section:has-text("Salary Negotiation") [data-testid="persona-card"]');
  await expect(salaryCards).toHaveCount(3);

  await expect(page.locator('h2:has-text("Convince Your Team"), h3:has-text("Convince Your Team"), section:has-text("Convince Your Team")').first()).toBeVisible();
  const aiCards = page.locator('section:has-text("Convince Your Team") [data-testid="persona-card"]');
  await expect(aiCards).toHaveCount(6);
});

test('skeptic persona has a distinctive greeting', async ({ page }) => {
  await loginAsDemo(page);

  await page.locator('[data-testid="persona-card"]:has-text("Sarah the Security Hawk")').click();
  await page.waitForURL('**/chat', { timeout: 15000 });

  const greeting = page.locator('[data-testid="assistant-message"]').first();
  await expect(greeting).toBeVisible({ timeout: 15000 });
  // Sarah's seeded greeting mentions "security review"
  await expect(greeting).toContainText('security', { ignoreCase: true });
});

test('persona responds to user messages', async ({ page }) => {
  await loginAsDemo(page);

  // Use Bob — his greeting is distinctive and he should push back on any argument
  await page.locator('[data-testid="persona-card"]:has-text("Bob the Dinosaur")').click();
  await page.waitForURL('**/chat', { timeout: 15000 });
  await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 15000 });

  await page.fill('[data-testid="chat-input"]', 'AI will make our work more creative and fun!');
  await page.click('[data-testid="send-button"]');

  // Wait for Bob's response (greeting = 1, new response = 2)
  const responses = page.locator('[data-testid="assistant-message"]');
  await expect(responses).toHaveCount(2, { timeout: 30000 });

  // Verify the response is non-trivial (at least a sentence)
  const response = responses.last();
  const text = await response.textContent();
  expect(text!.length).toBeGreaterThan(20);
});

test('mood indicator is visible during conversation', async ({ page }) => {
  await loginAsDemo(page);

  await page.locator('[data-testid="persona-card"]:has-text("Tech-Timid Tim")').click();
  await page.waitForURL('**/chat', { timeout: 15000 });
  await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 15000 });

  const moodIndicator = page.locator('[data-testid="mood-indicator"]');
  await expect(moodIndicator.first()).toBeVisible();
});
