/**
 * Configuration for Playwright using default from @jupyterlab/galata
 */
const fs = require('fs');
const path = require('path');
const baseConfig = require('@jupyterlab/galata/lib/playwright-config');

/**
 * JupyterLab listens on WEBMCP_TEST_PORT, Jupyter Notebook and JupyterLite
 * on the next two ports. The default keeps away from a Jupyter server
 * started by the user on 8888.
 */
const port = Number(process.env.WEBMCP_TEST_PORT || 18880);
const url = offset => `http://127.0.0.1:${port + offset}`;

/**
 * Run the tests against servers that are already running only when asked.
 */
const reuseExistingServer = process.env.WEBMCP_REUSE_SERVER === '1';

/**
 * The JupyterLite site is built by `jlpm build:lite`. Without it, only CI
 * fails: locally, the JupyterLite tests are left out.
 */
const withLite =
  !!process.env.CI ||
  fs.existsSync(path.join(__dirname, 'lite', '_output', 'index.html'));

module.exports = {
  ...baseConfig,
  testDir: './tests',
  use: {
    ...baseConfig.use,
    channel: process.env.WEBMCP_TEST_CHANNEL || undefined,
    launchOptions: {
      /**
       * WebMCP is behind a feature flag. Playwright passes its own
       * --enable-features, which a second flag would replace. The other
       * flags keep Chromium away from the keychain of macOS and Linux.
       */
      args: [
        '--enable-features=WebMCP,CDPScreenshotNewSurface',
        '--use-mock-keychain',
        '--password-store=basic'
      ]
    }
  },
  projects: [
    {
      name: 'jupyterlab',
      testMatch: 'jupyterlab/*.spec.ts',
      // Some tests start kernels.
      timeout: 120 * 1000,
      use: { baseURL: url(0) }
    },
    {
      name: 'notebook',
      testMatch: 'single-document.spec.ts',
      use: { baseURL: url(1) }
    },
    ...(withLite
      ? [
          {
            name: 'jupyterlite',
            testMatch: ['single-document.spec.ts', 'jupyterlite/*.spec.ts'],
            // Pyodide is downloaded from a CDN for each test.
            timeout: 300 * 1000,
            use: { baseURL: url(2) }
          }
        ]
      : [])
  ],
  webServer: [
    {
      command: `jlpm start --port=${port}`,
      url: `${url(0)}/lab`,
      timeout: 120 * 1000,
      reuseExistingServer
    },
    {
      command: `jlpm start:notebook --port=${port + 1}`,
      url: `${url(1)}/tree`,
      timeout: 120 * 1000,
      reuseExistingServer
    },
    ...(withLite
      ? [
          {
            command: `jlpm start:lite ${port + 2}`,
            url: `${url(2)}/lab/index.html`,
            timeout: 30 * 1000,
            reuseExistingServer
          }
        ]
      : [])
  ]
};
