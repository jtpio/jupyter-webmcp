import { Token } from '@lumino/coreutils';
import { LOG_PREFIX } from './commands';

/**
 * The WebMCP polyfill of the page.
 */
export interface IWebMCPPolyfill {
  /**
   * Whether the polyfill provides the `ModelContext` of the document.
   */
  readonly isInstalled: boolean;
}

/**
 * The token for the WebMCP polyfill. It makes the polyfill plugin start
 * before the plugins that read `document.modelContext`.
 */
export const IWebMCPPolyfill = new Token<IWebMCPPolyfill>(
  'jupyter-webmcp:IWebMCPPolyfill',
  'The WebMCP polyfill, installed when the browser has no WebMCP.'
);

/**
 * Install the WebMCP polyfill when the document has no `ModelContext`. The
 * polyfill is loaded only then.
 *
 * @returns whether the polyfill provides the `ModelContext` of the document.
 * It does not outside a secure context.
 */
export async function installPolyfill(): Promise<boolean> {
  if ('modelContext' in document) {
    return false;
  }
  try {
    const { installWebMCP } = await import('@w3c/webmcp-polyfill');
    installWebMCP();
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} The WebMCP polyfill could not be installed:`,
      error
    );
  }
  return 'modelContext' in document;
}
