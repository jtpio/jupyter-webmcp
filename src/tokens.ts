import { Token } from '@lumino/coreutils';
import { IDisposable } from '@lumino/disposable';
import { ISignal } from '@lumino/signaling';
import { IModelContextTool } from './modelcontext';

/**
 * The registry of the WebMCP tools of the page, which other extensions can
 * use to register their own tools.
 */
export interface IWebMCPRegistry {
  /**
   * Whether the page has the WebMCP API, from the browser or from a
   * polyfill.
   */
  readonly isAvailable: boolean;

  /**
   * Whether a polyfill provides the WebMCP API: only the agents that run in
   * the page can then call the tools.
   */
  readonly isPolyfilled: boolean;

  /**
   * Names of the tools registered through this registry.
   */
  readonly toolNames: readonly string[];

  /**
   * Signal emitted when a tool is registered or removed.
   */
  readonly changed: ISignal<IWebMCPRegistry, void>;

  /**
   * Register a WebMCP tool; dispose the result to remove it.
   *
   * @throws if WebMCP is not available or the tool name is taken.
   */
  registerTool(tool: IModelContextTool): Promise<IDisposable>;
}

/**
 * The token for the WebMCP tool registry.
 */
export const IWebMCPRegistry = new Token<IWebMCPRegistry>(
  'jupyter-webmcp:IWebMCPRegistry',
  'A registry of the WebMCP tools exposed to browser agents.'
);
