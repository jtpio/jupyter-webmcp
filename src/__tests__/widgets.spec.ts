import { CommandRegistry } from '@lumino/commands';
import { Widget } from '@lumino/widgets';
import { CommandIDs } from '../commands';
import { ToolManager } from '../manager';
import { WebMCPRegistry } from '../registry';
import { ToolList, WebMCPStatus } from '../widgets';
import { FakeModelContext, tool, trans } from './utils';

const HINT =
  'WebMCP is not available on this page. Open Jupyter from localhost or HTTPS. Without the polyfill, also enable WebMCP in Chrome with chrome://flags/#enable-webmcp-testing (or --enable-features=WebMCP).';

const POLYFILL_HINT =
  'This browser has no WebMCP: a polyfill provides it, and only the agents that run in the page can call the tools. For the other agents, enable WebMCP in Chrome with chrome://flags/#enable-webmcp-testing (or --enable-features=WebMCP).';

describe('WebMCPStatus', () => {
  function setup(available = true, polyfilled = false) {
    const registry = new WebMCPRegistry(
      available ? new FakeModelContext() : null,
      polyfilled
    );
    const commands = new CommandRegistry();
    const execute = jest.fn();
    commands.addCommand(CommandIDs.showTools, { execute });
    const item = new WebMCPStatus({ registry, commands, trans });
    return { execute, item, registry };
  }

  it('shows the number of tools', async () => {
    const { item, registry } = setup();
    expect(item.node.textContent).toBe('WebMCP: 0 tools');
    expect(item.hasClass('jp-mod-highlighted')).toBe(true);
    expect(item.hasClass('jp-mod-unavailable')).toBe(false);
    expect(item.node.getAttribute('role')).toBe('button');
    expect(item.node.getAttribute('aria-haspopup')).toBe('dialog');
    expect(item.node.tabIndex).toBe(0);
    const registration = await registry.registerTool(tool('a'));
    expect(item.node.textContent).toBe('WebMCP: 1 tool');
    expect(item.node.title).toBe(
      'This page exposes 1 WebMCP tool to browser agents. Click to list it.'
    );
    registration.dispose();
    expect(item.node.textContent).toBe('WebMCP: 0 tools');
    item.dispose();
  });

  it('shows when a polyfill provides WebMCP', async () => {
    const { item, registry } = setup(true, true);
    expect(item.node.textContent).toBe('WebMCP: 0 tools (polyfill)');
    expect(item.hasClass('jp-mod-unavailable')).toBe(false);
    await registry.registerTool(tool('a'));
    expect(item.node.textContent).toBe('WebMCP: 1 tool (polyfill)');
    expect(item.node.title).toBe(POLYFILL_HINT);
    item.dispose();
  });

  it('shows when WebMCP is not available', () => {
    const { item } = setup(false);
    expect(item.node.textContent).toBe('WebMCP: unavailable');
    expect(item.hasClass('jp-mod-unavailable')).toBe(true);
    expect(item.node.title).toBe(HINT);
    item.dispose();
  });

  it('lists the tools on click and on Enter while attached', () => {
    const { execute, item } = setup();
    Widget.attach(item, document.body);
    item.node.click();
    item.node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    item.node.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(execute).toHaveBeenCalledTimes(2);
    Widget.detach(item);
    item.node.click();
    expect(execute).toHaveBeenCalledTimes(2);
    item.dispose();
  });
});

describe('ToolList', () => {
  const manager = (values: Partial<ToolManager>) =>
    ({ error: null, warnings: [], tools: new Map(), ...values }) as ToolManager;

  it('lists the tools with their command', async () => {
    const registry = new WebMCPRegistry(new FakeModelContext());
    await registry.registerTool(tool('read_file'));
    await registry.registerTool(tool('get_context'));
    const list = new ToolList({
      registry,
      manager: manager({
        tools: new Map([
          ['read_file', 'ai:get-file-info'],
          ['get_context', null]
        ]),
        warnings: ['A warning.']
      }),
      trans
    });
    const items = list.node.querySelectorAll('.jp-WebMCPToolList-item');
    expect(
      list.node.querySelector('.jp-WebMCPToolList-list')?.children
    ).toHaveLength(2);
    expect(Array.from(items).map(item => item.textContent)).toEqual([
      'get_context',
      'read_file ai:get-file-info'
    ]);
    expect(
      list.node.querySelector('.jp-WebMCPToolList-warning')?.textContent
    ).toBe('A warning.');
    list.dispose();
  });

  it('tells that a polyfill provides WebMCP', async () => {
    const registry = new WebMCPRegistry(new FakeModelContext(), true);
    await registry.registerTool(tool('get_context'));
    const list = new ToolList({ registry, manager: manager({}), trans });
    expect(
      Array.from(list.node.children).map(node => node.textContent)
    ).toEqual([
      POLYFILL_HINT,
      'The agents that run in this page can call these tools:',
      'get_context'
    ]);
    list.dispose();
  });

  it('reports an error and the absence of tools', () => {
    const list = new ToolList({
      registry: new WebMCPRegistry(new FakeModelContext()),
      manager: manager({ error: 'Bad settings' }),
      trans
    });
    expect(
      Array.from(list.node.children).map(node => node.textContent)
    ).toEqual([
      'No tool is registered: Bad settings',
      'No WebMCP tool is registered yet.'
    ]);
    list.dispose();
  });

  it('explains how to enable WebMCP', () => {
    const list = new ToolList({
      registry: new WebMCPRegistry(null),
      manager: manager({}),
      trans
    });
    expect(list.node.textContent).toBe(HINT);
    list.dispose();
  });
});
