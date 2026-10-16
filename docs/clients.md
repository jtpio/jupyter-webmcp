# Clients

Agents outside the browser reach the WebMCP tools of a page through a browser bridge. Each section gives the version of the client that was checked with the [tested versions](../README.md#requirements) of Chrome and Jupyter.

Chrome exposes `document.modelContext` only when WebMCP is enabled: with `chrome://flags/#enable-webmcp-testing`, or with `--enable-features=WebMCP` on the command line. A browser that a bridge starts needs the command-line flag.

The tools register when the Jupyter page has opened its documents, a few seconds after the page loads. A client that lists the tools right after a navigation can get an empty list: list them again. A Jupyter Notebook or JupyterLite page that has no document to show, such as a notebook page without a path, stays blank and has no tools.

## Playwright MCP

Checked with `@playwright/mcp` 0.0.83. Playwright MCP does not add the Chrome flag: start it with the configuration file of the [quick start](../README.md#playwright-mcp).

- WebMCP support is on by default (`--no-webmcp` turns it off).
- Each page tool is a separate MCP tool, `webmcp_<name>`, so the agent can allow or deny each tool in its permissions.
- Playwright MCP collects the tools when a response includes a page snapshot (`browser_navigate`, `browser_snapshot`, a click). A tool registered after the last snapshot appears after the next one.
- The tool hints become MCP annotations and tags in the description.
- A result with `isError: true` becomes an MCP error result.

Playwright MCP also gives the agent its own page tools, such as `browser_evaluate`, which can do anything that the extension refuses. It has no option to remove them: deny them in the permissions of the agent.

## chrome-devtools-mcp

Checked with chrome-devtools-mcp 1.11.0. The command of the [quick start](../README.md#chrome-devtools-mcp) uses these flags:

| Flag                                                       | Why                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `--categoryExperimentalWebmcp`                             | Adds `list_webmcp_tools` and `execute_webmcp_tool`, which are off by default |
| `--chromeArg=--enable-features=WebMCP`                     | Enables WebMCP in the Chrome that the server starts                          |
| `--isolated`                                               | Uses a temporary profile                                                     |
| `--no-category*` (6 flags), `--javascriptEvaluation=false` | Removes the tools that run scripts, send input, or inspect the browser       |

With these flags, the agent has 8 tools: `list_webmcp_tools`, `execute_webmcp_tool`, `list_pages`, `new_page`, `navigate_page`, `select_page`, `close_page` and `wait_for`. `--no-categoryNavigation` keeps only the two WebMCP tools: the agent then cannot open pages, so use it only with a running Chrome that has the Jupyter page open, and give the agent the page id.

- `list_webmcp_tools {pageId}` lists the tools of a page with their schemas, and `execute_webmcp_tool {pageId, toolName, input}` calls one. `pageId` is a number from `list_pages` or `new_page`, and `input` is a JSON string.
- A call returns `{"status": "Completed", "output": {...}}`.
- All the calls go through `execute_webmcp_tool`, so the agent permissions cannot tell the tools apart.

## A running Chrome

Start Chrome with a dedicated profile (Chrome refuses remote debugging on the default profile). On macOS:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --enable-features=WebMCP --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-webmcp" --use-mock-keychain
```

On Linux, run `google-chrome` with `--password-store=basic` in place of `--use-mock-keychain`. Without these flags, Chrome can ask for access to the keychain of the system.

Then connect the bridge to it, for example `chrome-devtools-mcp --browserUrl=http://127.0.0.1:9222` with the flags of the quick start (without `--isolated` and `--chromeArg`, which apply only to a Chrome that the server starts). Any process that can reach the debugging port controls the whole browser: see [security](security.md).

## Playwright library

Playwright 1.64 adds `page.webmcp`, which lists and calls the tools of a page from scripts and tests. Checked with Playwright 1.64.1:

```js
import { chromium } from 'playwright';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-features=WebMCP,CDPScreenshotNewSurface']
});
const page = await browser.newPage();
await page.goto('http://localhost:8888/lab?token=…');

const deadline = Date.now() + 15000;
let tools = [];
while (!tools.some(tool => tool.name === 'get_context')) {
  if (Date.now() > deadline) {
    throw new Error('The page registered no get_context tool.');
  }
  await page.waitForTimeout(250);
  tools = await page.webmcp.tools();
}
const context = await page.webmcp.callTool('get_context');
console.log(context.app);
await browser.close();
```

- `page.webmcp` checks that the launch arguments enable `WebMCP`. Chrome keeps only the last `--enable-features` argument, and Playwright passes `--enable-features=CDPScreenshotNewSurface`: list both features in one argument.
- `callTool` returns the result object. With `@playwright/test`, pass the arguments in `use.launchOptions.args` and call `page.webmcp` on the `page` fixture.

## Example client

[`examples/webmcp-cli.mjs`](../examples/webmcp-cli.mjs) is a small client (Node 22 or later, no dependencies) that uses the CDP `WebMCP` domain of a running Chrome:

```bash
node examples/webmcp-cli.mjs --cdp http://127.0.0.1:9222 open "http://localhost:8888/lab?token=…"
node examples/webmcp-cli.mjs list --schemas
node examples/webmcp-cli.mjs call get_context
node examples/webmcp-cli.mjs call create_notebook '{"name": "demo"}'
node examples/webmcp-cli.mjs call add_cell '{"notebookPath": "demo.ipynb", "content": "1 + 1"}'
echo '{"path": ""}' | node examples/webmcp-cli.mjs call list_directory -
```

- Without `--page <text>`, it uses the first Jupyter page: JupyterLab, Jupyter Notebook or JupyterLite.
- `list` and `call` wait up to 15 seconds for the page to register its tools.
- `call` prints the result as JSON. The exit code is 1 when the browser reports the call as failed or canceled; a `{"success": false}` result exits with 0.
- `--timeout <seconds>` (default 120) and Ctrl-C cancel the call. The command continues in the page, and `get_context` lists it as pending.

The CDP `WebMCP` domain has these parts:

- `WebMCP.enable` sends `WebMCP.toolsAdded` for the tools that are already registered, then for new ones. `WebMCP.toolsRemoved` reports removed tools.
- `WebMCP.invokeTool {frameId, toolName, input}` returns an `invocationId`. The result comes in the `WebMCP.toolResponded` event, with `status` (`Completed`, `Error` or `Canceled`) and `output`. A fast tool can respond before `invokeTool` returns, so listen for the event first.
- `WebMCP.cancelInvocation {invocationId}` cancels a call.

## Electron

Electron apps that show Jupyter in a window can expose the tools. Use an Electron with Chromium 154 or later (`process.versions.chrome`) for all the features. This version of the extension was not tested in Electron. An earlier version worked in Electron 44.5.1 (Chromium 152), without the cancel signal (Chromium 153) and `consequentialHint` (Chromium 154).

Enable the feature in the window:

```js
const win = new BrowserWindow({
  webPreferences: { enableBlinkFeatures: 'WebMCP' }
});
```

Load Jupyter from `http://127.0.0.1`, `http://localhost` or HTTPS: Chromium 151 to 156 disable WebMCP on a page from a custom scheme. The main process calls the tools through `win.webContents.debugger` with the CDP `WebMCP` domain, as the example client does. External agents can connect to an app started with `--remote-debugging-port`, as for Chrome.
