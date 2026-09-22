import { clerkSetup } from '@clerk/testing/playwright';

// Only establish the browser testing token. No reseeding, global cleanup, or LLM calls.
export default async function previewSetup() {
  await clerkSetup();
}
