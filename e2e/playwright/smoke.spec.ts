import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers';

test('login page loads', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('h2:has-text("Persuaider"), h1:has-text("Persuaider")').first()).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
});

test('demo user can log in and see dashboard', async ({ page }) => {
  await loginAsDemo(page);
  await expect(page.locator('h2:has-text("Salary Negotiation"), h3:has-text("Salary Negotiation"), section:has-text("Salary Negotiation")').first()).toBeVisible();
  // 3 from salary negotiation + 6 from AI adoption = 9 total
  const personaCards = page.locator('[data-testid="persona-card"]');
  await expect(personaCards).toHaveCount(9);
});
