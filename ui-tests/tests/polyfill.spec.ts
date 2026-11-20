/**
 * Tests of JupyterLab in a browser without WebMCP: the extension installs
 * the polyfill, and scripts of the page call the tools.
 */
import { expect, test } from '@jupyterlab/galata';
import type { Page } from '@playwright/test';
import { ALL_TOOLS, type ToolResult, setSetting } from './helpers';

/**
 * The names of the tools that `document.modelContext` lists, sorted.
 */
async function toolNames(page: Pick<Page, 'evaluate'>): Promise<string[]> {
  return page.evaluate(async () => {
    const tools = await (document as any).modelContext.getTools();
    return tools.map((tool: { name: string }) => tool.name).sort();
  });
}

/**
 * Wait until the page registers exactly the given tools.
 */
async function waitForTools(
  page: Pick<Page, 'evaluate'>,
  names: string[]
): Promise<void> {
  await expect
    .poll(() => toolNames(page), { timeout: 30000 })
    .toEqual([...names].sort());
}

/**
 * Call a tool like an agent that runs in the page does.
 */
async function callTool(
  page: Pick<Page, 'evaluate'>,
  name: string,
  input: Record<string, unknown> = {}
): Promise<ToolResult> {
  return page.evaluate(
    async ({ name, input }) => {
      const context = (document as any).modelContext;
      const tools = await context.getTools();
      const tool = tools.find((tool: { name: string }) => tool.name === name);
      return JSON.parse(await context.executeTool(tool, input));
    },
    { name, input }
  );
}

test.beforeEach(async ({ page }) => {
  await waitForTools(page, ALL_TOOLS);
});

test('the status bar item should tell that the polyfill is used', async ({
  page
}) => {
  const status = page.locator('.jp-WebMCPStatus');
  await expect(status).toHaveText(
    `WebMCP: ${ALL_TOOLS.length} tools (polyfill)`
  );
  await expect(status).not.toHaveClass(/jp-mod-unavailable/);

  await status.click();
  const dialog = page.locator('.jp-Dialog');
  await expect(dialog.locator('.jp-WebMCPToolList')).toContainText(
    'This browser has no WebMCP: a polyfill provides it'
  );
  await expect(dialog.locator('.jp-WebMCPToolList-item')).toHaveCount(
    ALL_TOOLS.length
  );
});

test('a script of the page should call the tools', async ({ page }) => {
  expect(await callTool(page, 'get_context')).toMatchObject({
    success: true,
    app: { name: 'JupyterLab' },
    dialogs: [],
    pending: []
  });
  expect(await callTool(page, 'list_directory', { path: '' })).toMatchObject({
    success: true
  });
  // Errors are data, as with the WebMCP of the browser.
  expect(
    await callTool(page, 'execute_command', {
      command_id: 'apputils:run-all-enabled'
    })
  ).toEqual({
    success: false,
    isError: true,
    error:
      'The command "apputils:run-all-enabled" is blocked by the WebMCP settings (blockedCommands).'
  });
});

test('the tools should follow the settings', async ({ page }) => {
  await setSetting(page, 'disabledTools', ['get_*']);
  const enabled = ALL_TOOLS.filter(name => name !== 'get_context');
  await waitForTools(page, enabled);
  await expect(page.locator('.jp-WebMCPStatus')).toHaveText(
    `WebMCP: ${enabled.length} tools (polyfill)`
  );
});
