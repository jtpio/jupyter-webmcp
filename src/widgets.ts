import { TranslationBundle } from '@jupyterlab/translation';
import { CommandRegistry } from '@lumino/commands';
import { Message } from '@lumino/messaging';
import { Widget } from '@lumino/widgets';
import { CommandIDs } from './commands';
import { ToolManager } from './manager';
import { IWebMCPRegistry } from './tokens';

/**
 * Instructions shown when WebMCP is not available.
 */
export function unavailableHint(trans: TranslationBundle): string {
  return trans.__(
    'WebMCP is not available on this page. Open Jupyter from localhost or HTTPS. Without the polyfill, also enable WebMCP in Chrome with chrome://flags/#enable-webmcp-testing (or --enable-features=WebMCP).'
  );
}

/**
 * Explanation shown when a polyfill provides WebMCP.
 */
export function polyfillHint(trans: TranslationBundle): string {
  return trans.__(
    'This browser has no WebMCP: a polyfill provides it, and only the agents that run in the page can call the tools. For the other agents, enable WebMCP in Chrome with chrome://flags/#enable-webmcp-testing (or --enable-features=WebMCP).'
  );
}

/**
 * A status bar item showing how many WebMCP tools are registered; a click
 * lists them.
 */
export class WebMCPStatus extends Widget {
  /**
   * Construct a new status item.
   */
  constructor(options: WebMCPStatus.IOptions) {
    super();
    this._registry = options.registry;
    this._commands = options.commands;
    this._trans = options.trans;
    this.addClass('jp-WebMCPStatus');
    this.addClass('jp-mod-highlighted');
    this.node.setAttribute('role', 'button');
    this.node.setAttribute('aria-haspopup', 'dialog');
    this.node.tabIndex = 0;
    this._text = document.createElement('span');
    this._text.className = 'jp-StatusBar-TextItem';
    this.node.appendChild(this._text);
    this._registry.changed.connect(this._render, this);
    this._render();
  }

  /**
   * Handle the DOM events of the item.
   */
  handleEvent(event: Event): void {
    switch (event.type) {
      case 'click':
        void this._commands.execute(CommandIDs.showTools);
        break;
      case 'keydown': {
        const { key } = event as KeyboardEvent;
        if (key === 'Enter' || key === ' ') {
          event.preventDefault();
          void this._commands.execute(CommandIDs.showTools);
        }
        break;
      }
      default:
        break;
    }
  }

  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    this.node.addEventListener('click', this);
    this.node.addEventListener('keydown', this);
  }

  protected onBeforeDetach(msg: Message): void {
    this.node.removeEventListener('click', this);
    this.node.removeEventListener('keydown', this);
    super.onBeforeDetach(msg);
  }

  private _render(): void {
    const trans = this._trans;
    const available = this._registry.isAvailable;
    this.toggleClass('jp-mod-unavailable', !available);
    if (!available) {
      this._text.textContent = trans.__('WebMCP: unavailable');
      this.node.title = unavailableHint(trans);
      return;
    }
    const count = this._registry.toolNames.length;
    if (this._registry.isPolyfilled) {
      this._text.textContent = trans._n(
        'WebMCP: %1 tool (polyfill)',
        'WebMCP: %1 tools (polyfill)',
        count
      );
      this.node.title = polyfillHint(trans);
      return;
    }
    this._text.textContent = trans._n(
      'WebMCP: %1 tool',
      'WebMCP: %1 tools',
      count
    );
    this.node.title = trans._n(
      'This page exposes %1 WebMCP tool to browser agents. Click to list it.',
      'This page exposes %1 WebMCP tools to browser agents. Click to list them.',
      count
    );
  }

  private _registry: IWebMCPRegistry;
  private _commands: CommandRegistry;
  private _trans: TranslationBundle;
  private _text: HTMLSpanElement;
}

/**
 * A namespace for `WebMCPStatus` statics.
 */
export namespace WebMCPStatus {
  /**
   * Options to create the status item.
   */
  export interface IOptions {
    /**
     * The tool registry.
     */
    registry: IWebMCPRegistry;
    /**
     * The command registry.
     */
    commands: CommandRegistry;
    /**
     * The translation bundle.
     */
    trans: TranslationBundle;
  }
}

/**
 * The body of the dialog listing the registered tools.
 */
export class ToolList extends Widget {
  /**
   * Construct a new tool list.
   */
  constructor(options: ToolList.IOptions) {
    super();
    const { registry, manager, trans } = options;
    this.addClass('jp-WebMCPToolList');
    if (!registry.isAvailable) {
      this._paragraph(unavailableHint(trans));
      return;
    }
    if (registry.isPolyfilled) {
      this._paragraph(polyfillHint(trans));
    }
    if (manager.error) {
      this._paragraph(
        trans.__('No tool is registered: %1', manager.error),
        'jp-WebMCPToolList-error'
      );
    }
    const names = registry.toolNames;
    if (names.length === 0) {
      this._paragraph(trans.__('No WebMCP tool is registered yet.'));
    } else {
      this._paragraph(
        registry.isPolyfilled
          ? trans.__('The agents that run in this page can call these tools:')
          : trans.__('Browser agents can call these tools on this page:')
      );
      const commands = manager.tools;
      const list = document.createElement('ul');
      list.className = 'jp-WebMCPToolList-list';
      for (const name of names) {
        const item = document.createElement('li');
        item.className = 'jp-WebMCPToolList-item';
        const code = document.createElement('code');
        code.textContent = name;
        item.appendChild(code);
        const command = commands.get(name);
        if (command) {
          const detail = document.createElement('span');
          detail.className = 'jp-WebMCPToolList-command';
          detail.textContent = ` ${command}`;
          item.appendChild(detail);
        }
        list.appendChild(item);
      }
      this.node.appendChild(list);
    }
    for (const warning of manager.warnings) {
      this._paragraph(warning, 'jp-WebMCPToolList-warning');
    }
  }

  private _paragraph(text: string, className?: string): void {
    const node = document.createElement('p');
    node.textContent = text;
    if (className) {
      node.className = className;
    }
    this.node.appendChild(node);
  }
}

/**
 * A namespace for `ToolList` statics.
 */
export namespace ToolList {
  /**
   * Options to create a tool list.
   */
  export interface IOptions {
    /**
     * The tool registry.
     */
    registry: IWebMCPRegistry;
    /**
     * The manager of the tools of the extension.
     */
    manager: ToolManager;
    /**
     * The translation bundle.
     */
    trans: TranslationBundle;
  }
}
