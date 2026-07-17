import { beforeEach, describe, expect, it } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { GoogleGenAI, type Part, type Tool } from '@google/genai';
import type { ChatGenerateRequest } from '@modules/ai/application/ports/chat-model.port';
import { GeminiChatModelAdapter } from './gemini-chat-model.adapter';

// `jest` stays the ambient global rather than an import: this is the repo's only
// jest.mock() module mock, and @swc/jest hoists jest.mock above the imports, so an
// imported binding would be undefined at hoist time and the mock would silently
// no-op. Declaring the type gives the file real types without emitting an import.
declare const jest: typeof import('@jest/globals').jest;

/** The slice of the SDK call the adapter actually builds, as this spec reads it back. */
interface SdkRequest {
  model: string;
  contents: { role: string; parts: Part[] }[];
  config: {
    systemInstruction?: string;
    tools?: Tool[];
    abortSignal?: AbortSignal;
  };
}

/** The slice of the SDK response the adapter actually reads. */
interface SdkResponse {
  text?: string;
  candidates?: { content?: { parts?: Part[] } }[];
  usageMetadata?: { totalTokenCount?: number };
}

const mockGenerateContent = jest.fn<(req: SdkRequest) => Promise<SdkResponse>>();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

function makeAdapter(timeoutRaw?: string): GeminiChatModelAdapter {
  const cfg = {
    getOrThrow: jest.fn().mockReturnValue('test-key'),
    get: jest.fn().mockReturnValue(timeoutRaw),
  } as unknown as ConfigService;
  return new GeminiChatModelAdapter(cfg);
}

const request: ChatGenerateRequest = {
  systemInstruction: 'be helpful',
  messages: [
    { role: 'user', text: 'hello' },
    { role: 'model', functionCalls: [{ name: 'findOrderById', args: { orderId: 'o1' } }] },
    { role: 'tool', toolResults: [{ name: 'findOrderById', response: { found: true } }] },
  ],
  tools: [
    {
      name: 'findOrderById',
      description: 'look up an order',
      parametersJsonSchema: { type: 'object', properties: { orderId: { type: 'string' } } },
    },
  ],
};

describe('GeminiChatModelAdapter', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    jest.mocked(GoogleGenAI).mockClear();
  });

  it('constructs the SDK client with the configured api key (fail-fast)', () => {
    makeAdapter();
    expect(jest.mocked(GoogleGenAI)).toHaveBeenCalledWith({ apiKey: 'test-key' });
  });

  it('maps the port request into SDK contents, functionDeclarations and systemInstruction', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'hi', usageMetadata: { totalTokenCount: 42 } });
    const adapter = makeAdapter();

    await adapter.generate(request);

    const arg = mockGenerateContent.mock.calls[0][0];
    // The exact model is a tuning knob; assert the family, not a brittle literal.
    expect(arg.model).toMatch(/^gemini-/);
    expect(arg.config.systemInstruction).toBe('be helpful');
    expect(arg.config.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: 'findOrderById',
            description: 'look up an order',
            parametersJsonSchema: { type: 'object', properties: { orderId: { type: 'string' } } },
          },
        ],
      },
    ]);
    expect(arg.contents).toEqual([
      { role: 'user', parts: [{ text: 'hello' }] },
      {
        role: 'model',
        parts: [{ functionCall: { name: 'findOrderById', args: { orderId: 'o1' } } }],
      },
      {
        role: 'user',
        parts: [{ functionResponse: { name: 'findOrderById', response: { found: true } } }],
      },
    ]);
  });

  it('reads back text, function calls (with thought signature) and the token count', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'answer',
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: { name: 'getMyLoyalty', args: { customerId: 'x' } },
                thoughtSignature: 'sig-abc',
              },
            ],
          },
        },
      ],
      usageMetadata: { totalTokenCount: 77 },
    });
    const adapter = makeAdapter();

    const result = await adapter.generate(request);

    expect(result.text).toBe('answer');
    expect(result.functionCalls).toEqual([
      { name: 'getMyLoyalty', args: { customerId: 'x' }, thoughtSignature: 'sig-abc' },
    ]);
    expect(result.tokensUsed).toBe(77);
  });

  it('echoes a thought signature back on the replayed model function-call turn', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'ok', usageMetadata: { totalTokenCount: 1 } });
    const adapter = makeAdapter();

    await adapter.generate({
      systemInstruction: 'be helpful',
      messages: [
        {
          role: 'model',
          functionCalls: [
            { name: 'findOrderById', args: { orderId: 'o1' }, thoughtSignature: 'sig-xyz' },
          ],
        },
      ],
      tools: [],
    });

    const arg = mockGenerateContent.mock.calls[0][0];
    expect(arg.contents[0].parts[0]).toEqual({
      functionCall: { name: 'findOrderById', args: { orderId: 'o1' } },
      thoughtSignature: 'sig-xyz',
    });
  });

  it('defaults the token count to zero when usageMetadata is absent', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'answer' });
    const adapter = makeAdapter();

    const result = await adapter.generate(request);

    expect(result.tokensUsed).toBe(0);
    expect(result.functionCalls).toBeUndefined();
  });

  it('passes an abort signal so a hung provider call is bounded', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'hi', usageMetadata: { totalTokenCount: 1 } });
    const adapter = makeAdapter();

    await adapter.generate(request);

    const arg = mockGenerateContent.mock.calls[0][0];
    expect(arg.config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('rejects when the configured timeout is not a positive integer (fail-fast boot)', () => {
    expect(() => makeAdapter('0')).toThrow(/GEMINI_TIMEOUT_MS/);
    expect(() => makeAdapter('abc')).toThrow(/GEMINI_TIMEOUT_MS/);
  });

  it('propagates an SDK rejection (e.g. the abort) to the caller', async () => {
    const boom = new Error('The operation was aborted');
    mockGenerateContent.mockRejectedValue(boom);
    const adapter = makeAdapter();

    await expect(adapter.generate(request)).rejects.toBe(boom);
  });
});
