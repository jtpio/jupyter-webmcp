#!/usr/bin/env node

/**
 * A minimal WebMCP client: lists and calls the WebMCP tools of a Jupyter page
 * through the Chrome DevTools Protocol (CDP). Node 22+, no dependencies.
 */

const USAGE = `Usage: node webmcp-cli.mjs [options] <command>

Commands:
  pages                  List the page targets of the browser
  open <url>             Open <url> in a new tab and wait for the page load
  list                   List the WebMCP tools of the page
  call <tool> [json]     Call a tool with a JSON object input ("-" reads it
                         from stdin) and print its output

Options:
  --cdp <url>            CDP endpoint (default http://127.0.0.1:9222)
  --page <text>          Use the first page whose URL contains <text>
                         (default: the first Jupyter page, such as /lab,
                         /notebooks/... or /tree)
  --schemas              With list: print the input and output schemas
  --timeout <seconds>    Maximum time to wait for a tool result (default 120)
  -h, --help             Show this help

The exit code is 1 when the browser reports the call as failed (status
"Error" or "Canceled"); a {"success": false} result is a normal output.`;

/**
 * Time to wait for the page to register its tools, in milliseconds.
 */
const TOOLS_WAIT = 15000;

/**
 * The tool list is complete when no tool changes for this long, in
 * milliseconds.
 */
const TOOLS_QUIET = 300;

/**
 * Stop waiting for a missing tool when the other tools did not change for
 * this long, in milliseconds.
 */
const TOOLS_SETTLED = 2000;

/**
 * Paths of the Jupyter pages: JupyterLab, Jupyter Notebook and JupyterLite
 * (which adds /index.html). Other sites use them too, such as GitHub.
 */
const JUPYTER_PAGE = /\/(lab|notebooks|tree|edit|consoles)(\/|$)/;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Parse the command line.
 */
function parseArgs(argv) {
  const options = {
    cdp: 'http://127.0.0.1:9222',
    page: null,
    schemas: false,
    timeout: 120,
    help: false
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inline] = arg.startsWith('--') ? arg.split(/=(.*)/s) : [arg];
    const value = () => {
      const next = inline ?? argv[++i];
      if (next === undefined) {
        throw new Error(`${flag} needs a value`);
      }
      return next;
    };
    if (flag === '--cdp') {
      options.cdp = value().replace(/\/+$/, '');
    } else if (flag === '--page') {
      options.page = value();
    } else if (flag === '--timeout') {
      options.timeout = Number(value());
      if (!(options.timeout > 0)) {
        throw new Error('--timeout must be a positive number of seconds');
      }
    } else if (flag === '--schemas') {
      options.schemas = true;
    } else if (flag === '-h' || flag === '--help') {
      options.help = true;
    } else if (flag.startsWith('--')) {
      throw new Error(`Unknown option ${flag}`);
    } else {
      positional.push(arg);
    }
  }
  return { options, positional };
}

/**
 * A CDP connection to one target.
 */
class Connection {
  static async open(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error(`Cannot connect to ${url}`));
    });
    return new Connection(ws);
  }

  constructor(ws) {
    this._ws = ws;
    this._id = 0;
    this._calls = new Map();
    this._listeners = new Set();
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      const call = this._calls.get(message.id);
      if (call) {
        this._calls.delete(message.id);
        if (message.error) {
          call.reject(new Error(`${message.error.message} (${call.method})`));
        } else {
          call.resolve(message.result);
        }
      } else if (message.method) {
        this._listeners.forEach(listener => listener(message));
      }
    };
  }

  send(method, params = {}) {
    const id = ++this._id;
    this._ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) =>
      this._calls.set(id, { method, resolve, reject })
    );
  }

  /**
   * Listen to CDP events; returns a function removing the listener.
   */
  on(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  close() {
    this._ws.close();
  }
}

/**
 * The page targets of the browser.
 */
async function listPages(cdp) {
  const response = await request(cdp, '/json/list');
  return (await response.json()).filter(target => target.type === 'page');
}

/**
 * An HTTP request to the CDP endpoint.
 */
async function request(cdp, path, init) {
  let response;
  try {
    response = await fetch(`${cdp}${path}`, init);
  } catch {
    throw new Error(
      `Cannot reach ${cdp}. Start the browser with --remote-debugging-port, or pass --cdp.`
    );
  }
  if (!response.ok) {
    throw new Error(
      `${path} returned HTTP ${response.status}: ${await response.text()}`
    );
  }
  return response;
}

/**
 * Connect to a target, through the host of the CDP endpoint (which may be
 * a tunnel or a forwarded port).
 */
function connect(cdp, target) {
  const url = new URL(target.webSocketDebuggerUrl);
  url.host = new URL(cdp).host;
  return Connection.open(url.href);
}

/**
 * Whether a page target shows a Jupyter app: all of them embed
 * #jupyter-config-data.
 */
async function isJupyterPage(cdp, target) {
  if (!JUPYTER_PAGE.test(new URL(target.url).pathname)) {
    return false;
  }
  const connection = await connect(cdp, target);
  try {
    const { result } = await connection.send('Runtime.evaluate', {
      expression: "document.getElementById('jupyter-config-data') !== null",
      returnByValue: true
    });
    return result.value === true;
  } finally {
    connection.close();
  }
}

/**
 * Select the page to work with.
 */
async function selectPage(options) {
  const pages = await listPages(options.cdp);
  let page;
  for (const target of pages) {
    if (
      options.page
        ? target.url.includes(options.page)
        : await isJupyterPage(options.cdp, target)
    ) {
      page = target;
      break;
    }
  }
  if (!page) {
    const urls = pages.map(target => `  ${target.url}`).join('\n');
    const wanted = options.page
      ? `No page URL contains "${options.page}"`
      : 'No Jupyter page is open';
    throw new Error(`${wanted}. Open pages:\n${urls || '  (none)'}`);
  }
  return page;
}

/**
 * Enable the WebMCP domain and collect the tools of the page. Waits until
 * `name` (or any tool) is registered and the list stops changing.
 */
async function loadTools(connection, name) {
  const { result } = await connection.send('Runtime.evaluate', {
    expression: 'typeof document.modelContext',
    returnByValue: true
  });
  if (result.value === 'undefined') {
    throw new Error(
      'WebMCP is not available on this page (document.modelContext is undefined). Start Chrome with --enable-features=WebMCP, and open Jupyter from localhost or HTTPS.'
    );
  }
  const tools = new Map();
  let changed = Date.now();
  connection.on(({ method, params }) => {
    if (method === 'WebMCP.toolsAdded') {
      params.tools.forEach(tool => tools.set(tool.name, tool));
      changed = Date.now();
    } else if (method === 'WebMCP.toolsRemoved') {
      params.tools.forEach(tool => tools.delete(tool.name));
      changed = Date.now();
    }
  });
  // Enabling the domain replays the tools that are already registered.
  await connection.send('WebMCP.enable');
  const end = Date.now() + TOOLS_WAIT;
  while (Date.now() < end) {
    const quiet = Date.now() - changed;
    const ready = name ? tools.has(name) : tools.size > 0;
    if (
      (ready && quiet > TOOLS_QUIET) ||
      (tools.size > 0 && quiet > TOOLS_SETTLED)
    ) {
      break;
    }
    await sleep(50);
  }
  return tools;
}

/**
 * Short flags for the tool annotations reported by CDP.
 */
function hints(annotations = {}) {
  return [
    annotations.readOnly && 'read-only',
    annotations.consequential && 'consequential',
    annotations.untrustedContent && 'untrusted-content'
  ].filter(Boolean);
}

async function listCommand(connection, options) {
  const tools = [...(await loadTools(connection)).values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  if (tools.length === 0) {
    console.log('No WebMCP tools are registered on this page.');
    return 0;
  }
  for (const tool of tools) {
    const flags = hints(tool.annotations);
    console.log(`${tool.name}${flags.length ? ` [${flags.join(', ')}]` : ''}`);
    console.log(`  ${tool.description}`);
    for (const key of options.schemas ? ['input', 'output'] : []) {
      const schema = tool[`${key}Schema`];
      if (schema) {
        console.log(
          `  ${key}: ${JSON.stringify(typeof schema === 'string' ? JSON.parse(schema) : schema)}`
        );
      }
    }
  }
  console.log(`\n${tools.length} tools`);
  return 0;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Parse the input of a tool call ("-" reads it from stdin).
 */
async function parseInput(json) {
  const text = json === '-' ? await readStdin() : (json ?? '{}');
  let input;
  try {
    input = JSON.parse(text);
  } catch (error) {
    throw new Error(`The tool input is not valid JSON: ${error.message}`);
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('The tool input must be a JSON object.');
  }
  return input;
}

async function callCommand(connection, options, name, input) {
  const tools = await loadTools(connection, name);
  const tool = tools.get(name);
  if (!tool) {
    throw new Error(
      `No tool "${name}" on this page. Tools: ${[...tools.keys()].sort().join(', ') || '(none)'}`
    );
  }

  // Listen before invoking: a fast tool can respond before invokeTool returns.
  const responses = new Map();
  connection.on(({ method, params }) => {
    if (method === 'WebMCP.toolResponded') {
      responses.set(params.invocationId, params);
    }
  });
  // Chrome 159 adds toolId and deprecates toolName.
  const { invocationId } = await connection.send('WebMCP.invokeTool', {
    frameId: tool.frameId,
    ...(tool.toolId ? { toolId: tool.toolId } : { toolName: name }),
    input
  });
  const cancel = async reason => {
    await connection
      .send('WebMCP.cancelInvocation', { invocationId })
      .catch(() => undefined);
    console.error(reason);
    return 1;
  };
  let interrupted = false;
  process.once('SIGINT', () => (interrupted = true));
  const end = Date.now() + options.timeout * 1000;
  while (!responses.has(invocationId)) {
    if (interrupted) {
      return cancel('Interrupted: the call was canceled.');
    }
    if (Date.now() > end) {
      return cancel(
        `No result after ${options.timeout} seconds: the call was canceled.`
      );
    }
    await sleep(50);
  }

  const response = responses.get(invocationId);
  if (response.status !== 'Completed') {
    const detail =
      response.errorText ||
      response.exception?.description ||
      'the page gave no message';
    console.error(`Tool call ${response.status}: ${detail}`);
    return 1;
  }
  let output = response.output;
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output);
    } catch {
      console.log(output);
      return 0;
    }
  }
  console.log(JSON.stringify(output, null, 2));
  return 0;
}

async function openCommand(options, url) {
  if (!url) {
    throw new Error('Missing URL. Usage: open <url>');
  }
  const response = await request(
    options.cdp,
    `/json/new?${encodeURIComponent(url)}`,
    {
      method: 'PUT'
    }
  );
  const target = await response.json();
  const connection = await connect(options.cdp, target);
  try {
    const loaded = new Promise(resolve =>
      connection.on(({ method }) => {
        if (method === 'Page.loadEventFired') {
          resolve();
        }
      })
    );
    await connection.send('Page.enable');
    const { result } = await connection.send('Runtime.evaluate', {
      expression: 'document.readyState',
      returnByValue: true
    });
    if (result.value !== 'complete') {
      await Promise.race([loaded, sleep(60000)]);
    }
    console.log(JSON.stringify({ id: target.id, url: target.url }, null, 2));
  } finally {
    connection.close();
  }
  return 0;
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const [command, ...args] = positional;
  if (options.help || !command) {
    console.log(USAGE);
    return options.help ? 0 : 1;
  }
  if (command === 'pages') {
    for (const page of await listPages(options.cdp)) {
      console.log(`${page.id}  ${page.url}`);
    }
    return 0;
  }
  if (command === 'open') {
    return openCommand(options, args[0]);
  }
  if (command !== 'list' && command !== 'call') {
    throw new Error(`Unknown command "${command}".\n\n${USAGE}`);
  }
  if (command === 'call' && !args[0]) {
    throw new Error('Missing tool name. Usage: call <tool> [json]');
  }
  const input = command === 'call' ? await parseInput(args[1]) : null;
  const page = await selectPage(options);
  const connection = await connect(options.cdp, page);
  try {
    return command === 'list'
      ? await listCommand(connection, options)
      : await callCommand(connection, options, args[0], input);
  } finally {
    connection.close();
  }
}

main().then(
  code => process.exit(code),
  error => {
    console.error(error.message);
    process.exit(1);
  }
);
