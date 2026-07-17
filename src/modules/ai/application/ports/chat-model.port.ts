export const CHAT_MODEL = Symbol('ChatModel');

// Provider-agnostic chat contract. The application talks only in these shapes; the
// concrete SDK (Gemini) is mapped to/from them in the infrastructure adapter, so no
// vendor type leaks past this port.
export type ChatRole = 'user' | 'model' | 'tool';

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  /**
   * Opaque provider continuation token attached to a model-produced function call
   * (Gemini calls it a "thought signature"). The application never reads it - it only
   * carries it back verbatim when replaying the model's tool-call turn, which
   * thinking models require to keep their reasoning context intact (omitting it makes
   * the provider reject the follow-up call). Undefined for calls the client sends or
   * for providers that don't use it.
   */
  thoughtSignature?: string;
}

export interface ToolResult {
  name: string;
  response: Record<string, unknown>;
}

// One turn in the conversation. A model turn may carry text and/or functionCalls;
// a tool turn carries the results we fed back after dispatching those calls.
export interface ChatMessage {
  role: ChatRole;
  text?: string;
  functionCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

// A tool the model may invoke. parametersJsonSchema is plain JSON Schema.
export interface ToolDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}

export interface ChatGenerateRequest {
  systemInstruction: string;
  messages: ChatMessage[];
  tools: ToolDeclaration[];
}

// One model response. functionCalls present means the model wants tools run before
// it can answer; text present means it answered. tokensUsed is what we meter.
export interface ChatGenerateResult {
  text?: string;
  functionCalls?: ToolCall[];
  tokensUsed: number;
}

export interface ChatModel {
  generate(req: ChatGenerateRequest): Promise<ChatGenerateResult>;
}
