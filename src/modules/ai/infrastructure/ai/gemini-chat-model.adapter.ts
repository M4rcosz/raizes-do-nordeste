import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, type Content, type Part, type Tool } from '@google/genai';
import { parseIntEnv } from '@shared/config/env';
import type {
  ChatGenerateRequest,
  ChatGenerateResult,
  ChatMessage,
  ChatModel,
  ToolCall,
  ToolDeclaration,
} from '@modules/ai/application/ports/chat-model.port';

const MODEL = 'gemini-3.1-flash-lite';

// Hard deadline for a single provider call. Without it a hung Gemini request
// pins the user's HTTP connection indefinitely, and one chat turn can make up to
// MAX_TOOL_ITERATIONS sequential calls - "provider slow" would become "app down".
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * The ONLY file allowed to import @google/genai. A pure mapper between the
 * provider-agnostic ChatModel port and the Gemini SDK: it translates our messages
 * into SDK `contents`/`tools` and reads the response back into the port shape. SDK
 * failures propagate as-is; the use case wraps them in AiProviderUnavailableError.
 */
@Injectable()
export class GeminiChatModelAdapter implements ChatModel {
  private readonly client: GoogleGenAI;
  private readonly timeoutMs: number;

  constructor(cfg: ConfigService) {
    // Fail-fast on boot: no key means the assistant cannot work at all.
    this.client = new GoogleGenAI({ apiKey: cfg.getOrThrow('GEMINI_API_KEY') });
    this.timeoutMs = parseIntEnv(
      'GEMINI_TIMEOUT_MS',
      cfg.get<string>('GEMINI_TIMEOUT_MS'),
      DEFAULT_TIMEOUT_MS,
      { min: 1 },
    );
  }

  async generate(req: ChatGenerateRequest): Promise<ChatGenerateResult> {
    const contents = req.messages.map((m) => GeminiChatModelAdapter.toContent(m));
    const tools: Tool[] = [
      {
        functionDeclarations: req.tools.map((t) => GeminiChatModelAdapter.toFunctionDeclaration(t)),
      },
    ];

    const response = await this.client.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: req.systemInstruction,
        tools,
        // Bounds the call: on timeout the SDK aborts and rejects, freeing the
        // socket. The use case turns that rejection into AiProviderUnavailableError.
        abortSignal: AbortSignal.timeout(this.timeoutMs),
      },
    });

    // Read function calls off the raw parts (not the response.functionCalls shortcut)
    // so we capture each call's thoughtSignature - a thinking model rejects the
    // follow-up turn if we replay its function call without that signature.
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const functionCalls: ToolCall[] = parts
      .filter((p) => p.functionCall)
      .map(
        (p): ToolCall => ({
          name: p.functionCall?.name ?? '',
          args: p.functionCall?.args ?? {},
          thoughtSignature: p.thoughtSignature,
        }),
      );

    return {
      text: response.text,
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
      tokensUsed: response.usageMetadata?.totalTokenCount ?? 0,
    };
  }

  private static toContent(message: ChatMessage): Content {
    // A tool turn carries the results we fed back; the SDK models these as a `user`
    // content of functionResponse parts.
    if (message.role === 'tool') {
      const parts: Part[] = (message.toolResults ?? []).map((r) => ({
        functionResponse: { name: r.name, response: r.response },
      }));
      return { role: 'user', parts };
    }

    const parts: Part[] = [];
    if (message.text) {
      parts.push({ text: message.text });
    }
    for (const call of message.functionCalls ?? []) {
      // Echo the thought signature back on the same part; the model requires it to
      // continue a tool-call turn it started.
      parts.push({
        functionCall: { name: call.name, args: call.args },
        thoughtSignature: call.thoughtSignature,
      });
    }
    return { role: message.role, parts };
  }

  private static toFunctionDeclaration(tool: ToolDeclaration) {
    return {
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.parametersJsonSchema,
    };
  }
}
