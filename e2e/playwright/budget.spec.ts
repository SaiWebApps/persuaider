import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsDemo } from './helpers';

/**
 * Slice 6 acceptance: every model call is metered, the profile shows today's
 * usage, and an admin-set budget stops the chat with a plain message.
 */
test('usage shows on the profile and an admin-set budget stops the chat', async ({ browser }) => {
  test.setTimeout(150000);

  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await loginAsAdmin(adminPage);
  await adminPage.goto('/admin/users');
  const budget = adminPage.locator('[data-testid="budget-demo@persuaider.com"]');
  await expect(budget).toBeVisible();

  const demo = await browser.newContext();
  const demoPage = await demo.newPage();
  try {
    // 1. A normal turn is metered and shows up on the profile.
    await loginAsDemo(demoPage);
    await demoPage.locator('[data-testid="persona-card"]:has-text("Tech-Timid Tim")').click();
    await demoPage.waitForURL('**/chat', { timeout: 15000 });
    await demoPage.waitForSelector('[data-testid="assistant-message"]', { timeout: 15000 });
    await demoPage.fill('[data-testid="chat-input"]', 'What worries you most about trying AI?');
    await demoPage.click('[data-testid="send-button"]');
    await expect(demoPage.locator('[data-testid="assistant-message"]')).toHaveCount(2, { timeout: 45000 });

    await demoPage.goto('/profile');
    const usage = demoPage.locator('[data-testid="ai-usage"]');
    await expect(usage).toBeVisible();
    const text = (await usage.textContent()) ?? '';
    const spent = Number(/\$(\d+\.\d+) of/.exec(text)?.[1] ?? '0');
    const calls = Number(/\((\d+) calls?\)/.exec(text)?.[1] ?? '0');
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(spent).toBeGreaterThan(0);

    // 2. Admin sets a budget below what demo has already spent today.
    await budget.fill('0.0001');
    await budget.press('Enter');
    await expect(adminPage.locator('text=saved').first()).toBeVisible({ timeout: 10000 });

    // 3. Demo's next message is refused with a plain message; nothing is sent.
    await demoPage.goto('/dashboard');
    await demoPage.locator('[data-testid="persona-card"]:has-text("Tech-Timid Tim")').click();
    await demoPage.waitForURL('**/chat', { timeout: 15000 });
    const before = await demoPage.locator('[data-testid="user-message"], [data-testid="assistant-message"]').count();
    await demoPage.fill('[data-testid="chat-input"]', 'One more question.');
    await demoPage.click('[data-testid="send-button"]');
    const banner = demoPage.locator('[data-testid="chat-error"]');
    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(banner).toContainText('Daily AI budget reached');
    expect(await demoPage.locator('[data-testid="user-message"], [data-testid="assistant-message"]').count()).toBe(before);
  } finally {
    // 4. Restore the default so later tests and real use are unaffected.
    await budget.fill('');
    await budget.press('Enter');
    await expect(adminPage.locator('text=saved').first()).toBeVisible({ timeout: 10000 });
    await demo.close();
    await admin.close();
  }
});
