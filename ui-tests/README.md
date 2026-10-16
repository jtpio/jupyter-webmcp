# Integration Testing

These tests call the WebMCP tools of the page in a real Chromium, with
[Playwright](https://playwright.dev/docs/intro) (`page.webmcp`) and the
[Galata](https://github.com/jupyterlab/jupyterlab/tree/main/galata) helpers for
JupyterLab. Each app is a Playwright project with its own server:

| Project       | App                                 | Tests                                                                         |
| ------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| `jupyterlab`  | JupyterLab                          | `tests/jupyterlab/`                                                           |
| `notebook`    | Jupyter Notebook 7                  | `tests/single-document.spec.ts`                                               |
| `jupyterlite` | JupyterLite with the Pyodide kernel | `tests/single-document.spec.ts` (notebooks UI), `tests/jupyterlite/` (lab UI) |

- WebMCP is behind a feature flag: [playwright.config.js](./playwright.config.js)
  passes `--enable-features=WebMCP,CDPScreenshotNewSurface` (a second
  `--enable-features` would replace the one of Playwright), plus
  `--use-mock-keychain --password-store=basic` for the keychain of macOS and
  Linux.
- The tests use the Chromium of Playwright. Set `WEBMCP_TEST_CHANNEL` to use an
  installed Chrome, for example `chrome` or `chrome-beta`. CI tests Chrome
  stable and beta every week, to find the WebMCP changes of new releases.
- Playwright starts the servers on `WEBMCP_TEST_PORT` (default `18880`) and
  the next two ports, and fails if a port is in use. Set
  `WEBMCP_REUSE_SERVER=1` to use servers that already run.
- The servers use [jupyter_server_test_config.py](./jupyter_server_test_config.py).
  JupyterLite is a static site that `jlpm build:lite` builds in
  `lite/_output` with [uv](https://docs.astral.sh/uv/), in an environment of its
  own, from `lite/contents` and the built extension (`WEBMCP_LABEXTENSION`,
  default `../jupyter_webmcp/labextension`). Without this site, the
  `jupyterlite` project is left out, except on CI. Pyodide is downloaded from a
  CDN.

## Run the tests

> Steps 2 and 3 run in the ui-tests directory.

1. Install the extension in development mode (see
   [CONTRIBUTING.md](../CONTRIBUTING.md)), with Jupyter Notebook:

```sh
uv pip install --editable ".[dev]" notebook
jupyter-builder develop . --overwrite
jlpm build
```

2. Install the test dependencies and build the JupyterLite site (again after
   a change of the extension):

```sh
cd ./ui-tests
jlpm install
jlpm playwright install chromium
jlpm build:lite
```

3. Run the tests, for all the apps or for one:

```sh
jlpm playwright test
jlpm playwright test --project=notebook
```

In case of failures, the HTML report opens in the browser. Use
`jlpm playwright test --debug` or `--ui` to
[debug](https://playwright.dev/docs/debug) a test.

## Upgrade Playwright and the browsers

```sh
cd ./ui-tests
jlpm up "@playwright/test"
jlpm playwright install
```
