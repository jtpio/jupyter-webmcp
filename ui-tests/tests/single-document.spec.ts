/**
 * Tests of the apps that show one document per page: Jupyter Notebook and
 * JupyterLite (with its Notebook interface), one Playwright project each.
 */
import {
  type APIRequestContext,
  type Page,
  test as base,
  expect
} from '@playwright/test';
import {
  ALL_TOOLS,
  SINGLE_DOCUMENT_NOTE,
  type ToolResult,
  callTool,
  kernelStatus,
  runTool,
  settle,
  streamText,
  uniqueName,
  waitForTools
} from './helpers';

/**
 * What differs between the apps.
 */
interface IFrontend {
  /**
   * The application name.
   */
  app: string;
  /**
   * The URL of the file browser page.
   */
  tree: string;
  /**
   * The URL of the page of a notebook.
   */
  notebook: (path: string) => string;
  /**
   * The kernel name of the notebooks.
   */
  kernel: string;
  /**
   * Whether the kernel stops on an interrupt.
   */
  interrupts: boolean;
  /**
   * Create a notebook for a test and return its path.
   */
  createNotebook: (request: APIRequestContext) => Promise<string>;
  /**
   * Delete the notebook of a test and stop its kernels.
   */
  deleteNotebook: (request: APIRequestContext, path: string) => Promise<void>;
}

const FRONTENDS: Record<string, IFrontend> = {
  notebook: {
    app: 'Jupyter Notebook',
    tree: '/tree',
    notebook: path => `/notebooks/${path}`,
    kernel: 'python3',
    interrupts: true,
    createNotebook: async request => {
      const path = `${uniqueName('webmcp')}.ipynb`;
      const response = await request.put(`/api/contents/${path}`, {
        data: { type: 'notebook', content: notebookContent('python3') }
      });
      expect(response.ok()).toBe(true);
      return path;
    },
    deleteNotebook: async (request, path) => {
      const response = await request.get('/api/sessions');
      const sessions: { id: string; path: string }[] = await response.json();
      for (const session of sessions.filter(item => item.path === path)) {
        await request.delete(`/api/sessions/${session.id}`);
      }
      await request.delete(`/api/contents/${path}`);
    }
  },
  jupyterlite: {
    app: 'JupyterLite',
    tree: '/tree/index.html',
    notebook: path => `/notebooks/?path=${path}`,
    kernel: 'python',
    // Pyodide kernels do not support interrupts.
    interrupts: false,
    // Each test has a new browser storage with the contents of the site.
    createNotebook: async () => 'webmcp.ipynb',
    // The kernels stop with the page.
    deleteNotebook: async () => undefined
  }
};

/**
 * The tests get a notebook of their own, deleted with its kernels at the end.
 */
const test = base.extend<{ notebookPath: string }>({
  notebookPath: async ({ request }, use) => {
    const app = frontend();
    const path = await app.createNotebook(request);
    await use(path);
    await app.deleteNotebook(request, path);
  }
});

/**
 * The app of the project of the test.
 */
function frontend(): IFrontend {
  return FRONTENDS[test.info().project.name];
}

/**
 * Open the page of a notebook and wait for its kernel.
 */
async function openNotebook(page: Page, path: string): Promise<ToolResult> {
  await page.goto(frontend().notebook(path));
  await waitForTools(page, ALL_TOOLS, 60000);
  // JupyterLite downloads Pyodide before the kernel is ready.
  await expect
    .poll(() => kernelStatus(page, path), { timeout: 180000 })
    .toBe('idle');
  return callTool(page, 'get_context');
}

test('the file browser page should describe itself', async ({
  page,
  notebookPath: path
}) => {
  const app = frontend();
  await page.goto(app.tree);
  await waitForTools(page, ALL_TOOLS, 60000);

  const context = await callTool(page, 'get_context');
  expect(context).toMatchObject({
    success: true,
    app: { name: app.app },
    note: SINGLE_DOCUMENT_NOTE,
    currentWidgetId: null,
    currentEditor: null,
    // The file browser panel has no id.
    widgets: [{ type: 'TreePanel', title: '' }],
    dialogs: [],
    pending: []
  });
  expect(context.widgets[0]).not.toHaveProperty('id');

  const listed = await runTool(page, 'list_directory');
  expect(listed).toMatchObject({ success: true });
  expect(JSON.stringify(listed)).toContain(path);
});

test('open_document should open the document in a new browser tab', async ({
  page,
  notebookPath: path
}) => {
  const app = frontend();
  await page.goto(app.tree);
  await waitForTools(page, ALL_TOOLS, 60000);

  // The widget of the page is disposed and the document opens in a new tab.
  const [tab, opened] = await Promise.all([
    page.context().waitForEvent('page'),
    callTool(page, 'open_document', { path })
  ]);
  expect(opened).toEqual({
    success: true,
    result: { type: 'NotebookPanel', disposed: true }
  });
  expect(decodeURIComponent(tab.url())).toContain(app.notebook(path));
  // The new tab has its own tools.
  await waitForTools(tab, ALL_TOOLS, 60000);
  await tab.close();
});

test('the notebook page should edit and run the notebook', async ({
  page,
  notebookPath: path
}) => {
  const app = frontend();
  const context = await openNotebook(page, path);
  expect(context).toMatchObject({
    success: true,
    app: { name: app.app },
    note: SINGLE_DOCUMENT_NOTE,
    widgets: [
      {
        type: 'NotebookPanel',
        path,
        kernel: { name: app.kernel, status: 'idle' }
      }
    ]
  });
  const [notebook] = context.widgets;
  expect(context.currentWidgetId).toBe(notebook.id);
  expect(context.currentEditor).toEqual({
    cellId: notebook.notebook.activeCellId,
    cursor: { line: 1, column: 1 }
  });

  const added = await runTool(page, 'add_cell', {
    notebookPath: path,
    content: 'print(6 * 7)'
  });
  expect(added).toMatchObject({ success: true, cellType: 'code' });
  const run = await runTool(page, 'run_cell', {
    notebookPath: path,
    cellId: added.cellId
  });
  expect(run).toMatchObject({
    success: true,
    status: 'ok',
    cellId: added.cellId
  });
  expect(streamText(run)).toBe('42\n');

  // Errors are returned as data.
  const failing = await runTool(page, 'add_cell', {
    notebookPath: path,
    content: '1 / 0',
    referenceCellId: added.cellId
  });
  const failed = await runTool(page, 'run_cell', {
    notebookPath: path,
    cellId: failing.cellId
  });
  expect(failed).toMatchObject({
    success: false,
    isError: true,
    status: 'error'
  });
  expect(failed.error).toContain('ZeroDivisionError');
  expect(
    await callTool(page, 'run_cell', { notebook: path, cellId: added.cellId })
  ).toEqual({
    success: false,
    isError: true,
    error:
      'Unknown argument "notebook". Accepted arguments: "notebookPath", "cellId".'
  });
});

test('a call right after the tools register should use the document of the page', async ({
  page,
  notebookPath: path
}) => {
  const app = frontend();
  await page.goto(app.notebook(path));
  await waitForTools(page, ALL_TOOLS, 60000);

  // A call before the page opens its document would open a second one.
  const added = await runTool(page, 'add_cell', {
    notebookPath: path,
    content: 'print(6 * 7)'
  });
  const run = await runTool(page, 'run_cell', {
    notebookPath: path,
    cellId: added.cellId
  });
  expect(streamText(run)).toBe('42\n');
  const context = await callTool(page, 'get_context');
  expect(context.widgets).toMatchObject([{ type: 'NotebookPanel', path }]);
});

test('interrupt_kernel should tell whether the kernel stopped', async ({
  page,
  notebookPath: path
}) => {
  const app = frontend();
  const context = await openNotebook(page, path);
  const kernelId: string = context.widgets[0].kernel.id;
  const added = await runTool(page, 'add_cell', {
    notebookPath: path,
    content:
      'import time\nstart = time.time()\nwhile time.time() - start < 60:\n    pass'
  });
  const running = callTool(page, 'run_cell', {
    notebookPath: path,
    cellId: added.cellId
  });
  // An interrupt is lost if it reaches the kernel before the cell runs.
  await expect.poll(() => kernelStatus(page, path)).toBe('busy');

  const interrupted = await callTool(page, 'interrupt_kernel', { kernelId });
  if (app.interrupts) {
    expect(interrupted).toEqual({
      success: true,
      kernelId,
      message: 'The kernel was interrupted.'
    });
  } else {
    expect(interrupted).toEqual({
      success: true,
      kernelId,
      message: 'The interrupt was sent to the kernel.',
      warning:
        'The kernel is still busy and may not support interrupts (for example Pyodide in JupyterLite): restart_kernel stops it.'
    });
    expect(await runTool(page, 'restart_kernel', { kernelId })).toEqual({
      success: true,
      kernelId,
      message: 'The kernel was restarted.'
    });
  }
  const stopped = await settle(page, await running);
  expect(stopped).toMatchObject({
    success: false,
    isError: true,
    status: 'error'
  });
  if (app.interrupts) {
    expect(stopped.error).toMatch(/^KeyboardInterrupt/);
  }
});

/**
 * A notebook with an empty code cell.
 */
function notebookContent(kernel: string): Record<string, unknown> {
  return {
    cells: [
      {
        cell_type: 'code',
        execution_count: null,
        id: 'first',
        metadata: {},
        outputs: [],
        source: ''
      }
    ],
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: kernel }
    },
    nbformat: 4,
    nbformat_minor: 5
  };
}
