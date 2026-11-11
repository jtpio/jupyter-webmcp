/**
 * Typings for the WebMCP `ModelContext` API
 * (https://webmachinelearning.github.io/webmcp/), which is not in the
 * TypeScript DOM library yet.
 */

/**
 * Hints describing a tool.
 */
export interface IToolAnnotations {
  /**
   * The tool does not modify any state.
   */
  readOnlyHint?: boolean;
  /**
   * The tool output may contain untrusted content, such as file contents or
   * kernel outputs.
   */
  untrustedContentHint?: boolean;
  /**
   * The tool performs a significant action that is hard to reverse.
   */
  consequentialHint?: boolean;
}

/**
 * Options passed to a tool `execute` callback.
 */
export interface IToolExecuteOptions {
  /**
   * Aborted when the agent cancels the call.
   */
  signal?: AbortSignal;
}

/**
 * A tool definition as accepted by `ModelContext.registerTool`.
 */
export interface IModelContextTool {
  /**
   * Unique tool name: 1 to 128 ASCII letters, digits, `_`, `-` and `.`.
   */
  name: string;
  /**
   * Optional human readable title.
   */
  title?: string;
  /**
   * Description shown to the agent; must not be empty.
   */
  description: string;
  /**
   * JSON schema of the input object. Browsers do not validate the input.
   */
  inputSchema?: Record<string, unknown>;
  /**
   * JSON schema of the result. Browsers do not validate the result, but
   * agents may reject one that does not match.
   */
  outputSchema?: Record<string, unknown>;
  /**
   * Behavioral hints.
   */
  annotations?: IToolAnnotations;
  /**
   * The callback run for the agent. Objects reach the agent as JSON; thrown
   * errors reach it without their message.
   */
  execute: (
    input: Record<string, unknown>,
    options?: IToolExecuteOptions
  ) => unknown;
}

/**
 * The `document.modelContext` object.
 */
export interface IModelContext {
  /**
   * Register a tool; aborting `options.signal` removes it.
   */
  registerTool(
    tool: IModelContextTool,
    options?: { signal?: AbortSignal }
  ): Promise<void>;
}

/**
 * The `ModelContext` of the document, or `null` when the browser does not
 * support WebMCP or the feature is not enabled.
 */
export function getModelContext(): IModelContext | null {
  const doc = document as unknown as { modelContext?: IModelContext };
  return doc.modelContext ?? null;
}
