import { DisposableDelegate, IDisposable } from '@lumino/disposable';
import { ISignal, Signal } from '@lumino/signaling';
import { IModelContext, IModelContextTool } from './modelcontext';
import { IWebMCPRegistry } from './tokens';

/**
 * Registry wrapping `document.modelContext`.
 */
export class WebMCPRegistry implements IWebMCPRegistry {
  /**
   * Construct a new registry.
   *
   * @param modelContext - The `ModelContext` of the document, or `null`
   * when WebMCP is not available.
   * @param isPolyfilled - Whether a polyfill provides `modelContext`.
   */
  constructor(modelContext: IModelContext | null, isPolyfilled = false) {
    this._context = modelContext;
    this._isPolyfilled = isPolyfilled && modelContext !== null;
  }

  /**
   * Whether the page has the WebMCP API, from the browser or from a
   * polyfill.
   */
  get isAvailable(): boolean {
    return this._context !== null;
  }

  /**
   * Whether a polyfill provides the WebMCP API: only the agents that run in
   * the page can then call the tools.
   */
  get isPolyfilled(): boolean {
    return this._isPolyfilled;
  }

  /**
   * Names of the tools registered through this registry.
   */
  get toolNames(): readonly string[] {
    return Array.from(this._tools).sort();
  }

  /**
   * Signal emitted when a tool is registered or removed.
   */
  get changed(): ISignal<IWebMCPRegistry, void> {
    return this._changed;
  }

  /**
   * Register a WebMCP tool; dispose the result to remove it.
   */
  async registerTool(tool: IModelContextTool): Promise<IDisposable> {
    if (!this._context) {
      throw new Error(
        'WebMCP is not available: the page has no document.modelContext.'
      );
    }
    const { name } = tool;
    if (this._tools.has(name) || this._registering.has(name)) {
      throw new Error(`A WebMCP tool named "${name}" is already registered.`);
    }
    // WebMCP has no `unregisterTool`: aborting the signal removes the tool.
    const controller = new AbortController();
    this._registering.add(name);
    try {
      await this._context.registerTool(tool, { signal: controller.signal });
    } finally {
      this._registering.delete(name);
    }
    this._tools.add(name);
    this._changed.emit();
    return new DisposableDelegate(() => {
      controller.abort();
      this._tools.delete(name);
      this._changed.emit();
    });
  }

  private _context: IModelContext | null;
  private _isPolyfilled: boolean;
  private _tools = new Set<string>();
  private _registering = new Set<string>();
  private _changed = new Signal<IWebMCPRegistry, void>(this);
}
