import { test, expect, type Page } from '@playwright/test';
import { loginAsDemo } from '../helpers';

test.describe.configure({ retries: 0 });

test('the chat has the chosen look and remains usable on a phone', async ({ page }) => {
  test.setTimeout(300000);
  await loginAsDemo(page);

  const counterpart = 'Lou the Landlord';
  const brief = 'Keep the lease affordable.';
  const briefLine = 'You play: Tenant · your confidential brief';
  const greeting = 'Let us discuss the rent.';
  const actions = ['Back to Dashboard', 'Print / Export', 'Abort'];
  const created = await page.request.post('/api/scenarios', {
    data: {
      title: `E2E Chat screen ${Date.now()}`,
      description: 'Negotiate a commercial lease.',
      userRole: 'Tenant',
      aiRole: 'Landlord',
      roles: [
        { name: 'Tenant', description: brief },
        { name: 'Landlord', description: 'Protect the building value.' },
      ],
      learnerRoleName: 'Tenant',
      winCondition: { type: 'manual', maxMessages: 3 },
      personas: [{
        name: counterpart,
        roleType: 'Landlord',
        roleName: 'Landlord',
        description: 'Firm but fair.',
        initialGreeting: greeting,
      }],
    },
  });
  expect(created.ok()).toBe(true);
  const { scenario } = await created.json();
  const listed = await page.request.get(`/api/personas?scenarioId=${scenario.id}`);
  expect(listed.ok()).toBe(true);
  const { personas } = await listed.json();
  const persona = personas.find((item: { name: string }) => item.name === counterpart);
  expect(persona).toBeDefined();
  const chatPath = `/persona/${persona.id}/chat`;
  const header = page.getByTestId('chat-header');
  const menu = page.getByTestId('more-menu');
  const input = page.getByTestId('chat-input');
  const send = page.getByTestId('send-button');
  // The card deliberately leaves the arrow glyph unspecified. The decided
  // brief hook contains its single toggle button, regardless of icon choice.
  const briefToggle = page.getByTestId('your-brief').getByRole('button');
  const typing = page.getByTestId('typing-indicator');

  async function viewportIsUsable(target: Page) {
    for (const hook of ['chat-header', 'your-brief', 'chat-input', 'send-button']) {
      await expect(target.getByTestId(hook)).toBeInViewport({ ratio: 1 });
    }
    // These are page overflow assertions, not geometry-based element locators
    // or requirements about the arrangement/size of individual components.
    await expect.poll(() => target.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      return {
        horizontal: Math.max(root.scrollWidth, body.scrollWidth) > window.innerWidth,
        vertical: Math.max(root.scrollHeight, body.scrollHeight) > window.innerHeight,
      };
    })).toEqual({ horizontal: false, vertical: false });
  }

  async function openMore() {
    await expect(menu).toHaveCount(0);
    await header.getByRole('button', { name: 'More', exact: true }).click();
    await expect(menu).toBeVisible();
    for (const name of actions) {
      await expect(menu.getByRole('button', { name, exact: true })).toBeVisible();
    }
    // Read the menu's visible button words to check the explicitly decided
    // action order; never select a control by its index.
    const words = await menu.getByRole('button').allTextContents();
    expect(words.map(word => word.trim()).filter(word => actions.includes(word))).toEqual(actions);
    // Plain accessible name supplied for the otherwise unnamed theme control.
    await expect(menu.getByRole('button', { name: 'Theme', exact: true })).toBeVisible();
  }

  async function sendTurn(message: string, turns: number, inspectWaiting = false) {
    const replyRequests = (url: URL) => url.pathname.startsWith('/api/conversations/') &&
      (url.pathname.endsWith('/messages/stream') || url.pathname.endsWith('/messages'));
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    // Hold delivery, not AI content: the request and all reply words still come
    // from the real service. This makes the pending state observable reliably.
    await page.route(replyRequests, async route => {
      await gate;
      await route.continue();
    });
    const completed = page.waitForResponse(response =>
      replyRequests(new URL(response.url())) && response.ok(), { timeout: 60000 })
      .then(response => response.finished());
    await input.fill(message);
    if (inspectWaiting) await input.press('Enter');
    else await send.click();
    try {
      const ownBubble = page.getByTestId('user-message').filter({ hasText: message });
      await expect(ownBubble).toBeVisible();
      await expect(ownBubble).toContainText(message);
      await expect(ownBubble.getByTestId('message-sender')).toHaveText('You');
      await expect(typing).toBeVisible();
      await expect(typing).toHaveText(counterpart);
      if (inspectWaiting) {
        // Visual review checks the three non-text dots and bubble palette here.
        await page.screenshot({ path: test.info().outputPath('step-2-waiting.png') });
      }
    } finally {
      release();
    }
    await completed;
    await page.unroute(replyRequests);
    await expect(page.getByTestId('assistant-message')).toHaveCount(turns + 1, { timeout: 60000 });
    for (const reply of await page.getByTestId('assistant-message').all()) {
      await expect(reply).toBeVisible();
    }
    await expect(page.getByTestId('assistant-message').getByTestId('message-sender'))
      .toHaveText(Array(turns + 1).fill(counterpart));
    await expect(page.getByTestId('user-message').getByTestId('message-sender'))
      .toHaveText(Array(turns).fill('You'));
    await expect(typing).toHaveCount(0);
    await expect(page.getByTestId('assistant-message').getByTestId('mood-indicator')).toHaveCount(0);
    await expect(page.getByTestId('mood-indicator')).toHaveCount(1);
  }

  await test.step('Open a chat on a laptop: see the counterpart\'s name, their mood word (for example "Neutral"), the fold-out line "You play: … · your confidential brief", and one "End Negotiation" button; "Back to Dashboard", "Print / Export" and "Abort" are inside a "More" menu', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(chatPath);
    await expect(page).toHaveURL(chatPath);
    await expect(page).toHaveTitle(`${counterpart} · Persuaider`);
    await expect(header.getByTestId('counterpart-name')).toHaveText(counterpart);
    await expect(header.getByTestId('counterpart-name')).toBeVisible();
    await expect(header.getByTestId('mood-label')).toHaveText('Neutral');
    await expect(header.getByTestId('mood-label')).toBeVisible();
    await expect(header.getByTestId('mood-indicator')).toBeVisible();
    await expect(header.getByTestId('mood-indicator')).toHaveAttribute('data-mood', 'neutral');
    await expect(page.getByTestId('mood-indicator')).toHaveCount(1);
    await expect(page.getByTestId('mood-label')).toHaveCount(1);
    await expect(header.getByRole('button', { name: 'End Negotiation', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'End Negotiation', exact: true })).toHaveCount(1);
    await expect(briefToggle).toContainText(briefLine);
    expect((await briefToggle.innerText()).trim().startsWith(briefLine)).toBe(true);
    await expect(page.getByTestId('your-brief-text')).toHaveText(brief);
    await expect(page.getByTestId('your-brief-text')).toBeVisible();
    await briefToggle.click();
    await expect(page.getByTestId('your-brief-text')).toHaveCount(0);
    await briefToggle.click();
    await expect(page.getByTestId('your-brief-text')).toBeVisible();
    for (const name of [...actions, 'Theme']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeHidden();
    }
    await expect(typing).toHaveCount(0);
    await expect(page.getByTestId('limit-remaining')).toHaveCount(0);
    await openMore();
    // A real pointer click outside the menu also works with a click-away
    // backdrop: force skips interception checks, not browser event delivery.
    await input.click({ force: true });
    await expect(menu).toHaveCount(0);
    await openMore();
    await menu.getByRole('button', { name: 'Back to Dashboard', exact: true }).click();
    await expect(page).toHaveURL('/dashboard');
    await page.goto(chatPath);
    await expect(menu).toHaveCount(0);
    await viewportIsUsable(page);
    await openMore();
    await page.screenshot({ path: test.info().outputPath('step-1.png') });
  });

  await test.step('Send a message: your bubble appears on the right in the accent colour, the reply appears on the left under the counterpart\'s name, and three typing dots show while you wait', async () => {
    await input.click({ force: true });
    await expect(menu).toHaveCount(0);
    await expect(page.getByTestId('assistant-message')).toContainText(greeting);
    await sendTurn('Could we discuss a monthly rent of 1500 dollars?', 1, true);
    await viewportIsUsable(page);
    await page.screenshot({ path: test.info().outputPath('step-2.png') });
  });

  await test.step('Open the same chat on a phone: the header fits in one or two lines, messages use most of the width, the typing box sits at the bottom of the screen and is not hidden when the keyboard opens', async () => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await expect(page).toHaveURL(chatPath);
    await expect(header.getByTestId('counterpart-name')).toHaveText(counterpart);
    await expect(page.getByTestId('user-message')).toHaveCount(1);
    await expect(page.getByTestId('assistant-message')).toHaveCount(2);
    await expect(page.getByTestId('your-brief-text')).toHaveCount(0);
    await expect(briefToggle).toContainText(briefLine);
    await briefToggle.click();
    await expect(page.getByTestId('your-brief-text')).toHaveText(brief);
    await expect(page.getByTestId('your-brief-text')).toBeVisible();
    await briefToggle.click();
    await expect(page.getByTestId('your-brief-text')).toHaveCount(0);
    await viewportIsUsable(page);
    await page.screenshot({ path: test.info().outputPath('step-3-keyboard-closed.png') });

    // Desktop Playwright has no OS software keyboard. Emulate the keyboard's
    // resize-content viewport condition while the textarea remains focused,
    // rather than merely taking another unfocused phone screenshot.
    await input.click();
    await expect(input).toBeFocused();
    await page.setViewportSize({ width: 375, height: 367 });
    await expect(input).toBeFocused();
    const draft = 'I could commit to a longer lease.';
    await input.pressSequentially(draft);
    await expect(input).toHaveValue(draft);
    await expect(send).toBeEnabled();
    await viewportIsUsable(page);
    await expect(page.getByTestId('limit-remaining')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: test.info().outputPath('step-3.png') });
  });

  await test.step('With two messages left, see "2 messages left."; when they are used up, see the banner "You have used all N messages for this scenario." with the number filled in', async () => {
    await expect(page.getByTestId('limit-remaining')).toHaveText('2 messages left.');
    await expect(page.getByTestId('limit-remaining')).toBeVisible();
    await expect(page.getByTestId('limit-banner')).toHaveCount(0);
    await sendTurn('I could commit to a longer lease.', 2);
    await expect(page.getByTestId('limit-remaining')).toHaveText('1 message left.');
    await expect(page.getByTestId('limit-remaining')).toBeInViewport({ ratio: 1 });
    await sendTurn('What rent could you offer for a two-year lease?', 3);
    await expect(page.getByTestId('limit-remaining')).toHaveCount(0);
    await expect(page.getByTestId('limit-banner')).toHaveText(
      'You have used all 3 messages for this scenario. End the negotiation to get your summary.',
    );
    await expect(page.getByTestId('limit-banner')).toBeInViewport({ ratio: 1 });
    await viewportIsUsable(page);
    await page.screenshot({ path: test.info().outputPath('step-4.png') });
  });
});
