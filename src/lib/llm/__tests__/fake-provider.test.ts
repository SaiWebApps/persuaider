import { FakeProvider } from '../providers/fake';
import { LLMProviderFactory } from '../providers/factory';

afterEach(() => LLMProviderFactory.clearCache());

describe('FakeProvider', () => {
  it('serves scripted replies in order, then repeats the last one, and records calls', async () => {
    const fake = new FakeProvider(['first', 'second']);
    const chain = (LLMProviderFactory.useProviders([fake]), LLMProviderFactory.getProviderChain());
    expect((await chain.generateResponse([{ role: 'user', content: 'a' }])).content).toBe('first');
    expect((await chain.generateResponse([{ role: 'user', content: 'b' }])).content).toBe('second');
    expect((await chain.generateResponse([{ role: 'user', content: 'c' }])).content).toBe('second');
    expect(fake.calls).toHaveLength(3);
    expect(fake.calls[2].messages[0].content).toBe('c');
  });

  it('streams word by word and reports usage', async () => {
    const fake = new FakeProvider(['hello big world']);
    const chunks: string[] = [];
    for await (const c of fake.generateStreamingResponse([{ role: 'user', content: 'x' }])) chunks.push(c);
    expect(chunks.join('')).toBe('hello big world');
    const r = await fake.generateResponse([{ role: 'user', content: 'x' }]);
    expect(r.usage?.totalTokens).toBeGreaterThan(0);
    expect(r.provider).toBe('fake');
  });
});
