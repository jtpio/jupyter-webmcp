# Contributing

## Development install

Note: You will need Node.js to build the extension package.
You may install it from [nodejs.org](https://nodejs.org/en/download). We
recommend using the latest LTS version of Node.js.

The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab.

```bash
# Clone the repo to your local environment
# Change directory to the jupyter-webmcp directory

# Set up a virtual environment and install the package in development mode,
# with JupyterLab, jupyter-builder and jupyterlab-ai-commands
uv venv
source .venv/bin/activate
uv pip install --editable ".[dev]"

# Link your development version of the extension with JupyterLab
jupyter-builder develop . --overwrite

# Rebuild extension Typescript source after making changes
# IMPORTANT: Unlike the steps above which are performed only once, do this step
# every time you make a change.
jlpm build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

Open JupyterLab in a Chrome with WebMCP enabled (see the [requirements](README.md#requirements)), and call the tools with one of the [clients](docs/clients.md), for example the [example client](docs/clients.md#example-client).

By default, the `jlpm build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```bash
jupyter lab build --minimize=False
```

### Jupyter Notebook and JupyterLite

The development install also works in Jupyter Notebook:

```bash
uv pip install notebook
jupyter notebook
```

jupyterlite-pyodide-kernel installs a labextension that fails to load in JupyterLab and logs errors, so keep the JupyterLite packages out of the development environment. The [demo](https://github.com/jtpio/jupyter-webmcp/tree/main/demo) folder builds a JupyterLite site with the extension in an environment of its own, with [uv](https://docs.astral.sh/uv/):

```bash
cd demo
uv sync
uv run jupyter lite build
uv run jupyter lite serve
```

Then open `http://127.0.0.1:8000/lab/index.html`. Run `uv run jupyter lite build` again after `jlpm build`.

## Development uninstall

```bash
uv pip uninstall jupyter_webmcp
```

In development mode, you will also need to remove the symlink created by `jupyter-builder develop`
command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions`
folder is located. Then you can remove the symlink named `jupyter-webmcp` within that folder.

## Testing the extension

### Frontend tests

This extension is using [Jest](https://jestjs.io/) for JavaScript code testing.

To execute them, execute:

```sh
jlpm
jlpm test
```

### Integration tests

This extension uses [Playwright](https://playwright.dev/docs/intro) for the integration tests (aka user level tests).
More precisely, the JupyterLab helper [Galata](https://github.com/jupyterlab/jupyterlab/tree/main/galata) is used to handle testing the extension in JupyterLab.

More information is provided within the [ui-tests](https://github.com/jtpio/jupyter-webmcp/tree/main/ui-tests) README.

### Linting

```sh
jlpm lint:check  # or jlpm lint to fix the problems
```

## Documentation

The documentation is built with [MyST](https://mystmd.org) from the pages listed in `myst.yml`, and published on [Read the Docs](https://jupyter-webmcp.readthedocs.io/en/latest/). It needs only Node.js:

```bash
npm run docs        # preview the documentation
npm run docs:build  # build the HTML in _build/html
```

## Packaging the extension

See [RELEASE](RELEASE.md)
