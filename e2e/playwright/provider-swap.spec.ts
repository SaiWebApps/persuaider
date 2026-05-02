import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers';

test('chat response appears after provider swap', async ({ page }) => {
  await loginAsDemo(page);

  // Use Alex Chen specifically
  await page.locator('[data-testid="persona-card"]:has-text("Alex Chen")').click();
  await page.waitForURL('**/chat', { timeout: 15000 });

  // Wait for greeting
  const greeting = page.locator('[data-testid="assistant-message"]').first();
  await expect(greeting).toBeVisible({ timeout: 15000 });

  // Send a message
  await page.fill('[data-testid="chat-input"]', 'Tell me about your concerns');
  await page.click('[data-testid="send-button"]');

  // Wait for AI response
  const responses = page.locator('[data-testid="assistant-message"]');
  await expect(responses).toHaveCount(2, { timeout: 30000 });

  // Verify response has content
  const lastResponse = responses.last();
  const text = await lastResponse.textContent();
  expect(text!.length).toBeGreaterThan(10);
});
