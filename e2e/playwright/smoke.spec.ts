import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers';

test('login page loads Clerk sign-in widget', async ({ page }) => {
  await page.goto('/login');
  // Clerk's SignIn component renders inside a div with class cl-signIn-root or similar
  // Wait for Clerk to mount its UI
  await expect(
    page.locator('.cl-signIn-root, .cl-rootBox, [data-clerk-component="SignIn"]').first()
  ).toBeVisible({ timeout: 15000 });
});

test('demo user can log in and see dashboard', async ({ page }) => {
  await loginAsDemo(page);
  await expect(page.locator('h2:has-text("Salary Negotiation"), h3:has-text("Salary Negotiation"), section:has-text("Salary Negotiation")').first()).toBeVisible();
  // 3 from salary negotiation + 6 from AI adoption = 9 total
  const personaCards = page.locator('[data-testid="persona-card"]');
  await expect(personaCards).toHaveCount(9);
});
