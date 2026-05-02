import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers';

// Use a specific persona name so we don't depend on status from other tests
test('chat response appears after sending a message', async ({ page }) => {
  await loginAsDemo(page);

  // Click a specific persona by name — Pat Morales is unlikely to be consumed by other tests
  await page.locator('[data-testid="persona-card"]:has-text("Pat Morales")').click();
  await page.waitForURL('**/chat', { timeout: 15000 });
  await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 15000 });

  await page.fill('[data-testid="chat-input"]', 'What are your main concerns?');
  await page.click('[data-testid="send-button"]');

  // Wait for response — count should increase from 1 (greeting) to 2
  const assistantMessages = page.locator('[data-testid="assistant-message"]');
  await expect(assistantMessages).toHaveCount(2, { timeout: 30000 });

  const lastResponse = assistantMessages.last();
  const text = await lastResponse.textContent();
  expect(text!.length).toBeGreaterThan(10);
});

test('chat works when streaming endpoint fails (non-streaming fallback)', async ({ page }) => {
  // Block the streaming endpoint
  await page.route('**/api/conversations/*/messages/stream', route => {
    route.fulfill({ status: 500, body: 'Internal Server Error' });
  });

  await loginAsDemo(page);

  // Use Martha — a persona not used by other tests
  await page.locator('[data-testid="persona-card"]:has-text("Martha the Craftsperson")').click();
  await page.waitForURL('**/chat', { timeout: 15000 });
  await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 15000 });

  await page.fill('[data-testid="chat-input"]', 'Hello there');
  await page.click('[data-testid="send-button"]');

  // Should still get a response via non-streaming fallback
  const assistantMessages = page.locator('[data-testid="assistant-message"]');
  await expect(assistantMessages).toHaveCount(2, { timeout: 30000 });

  const lastResponse = assistantMessages.last();
  const text = await lastResponse.textContent();
  expect(text!.length).toBeGreaterThan(5);
});
