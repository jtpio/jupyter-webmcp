# JupyterLite Demo

This folder contains a [JupyterLite](https://jupyterlite.readthedocs.io/) site for trying
[jupyter-webmcp](https://github.com/jtpio/jupyter-webmcp) directly in the browser.

The site is built and deployed to GitHub Pages by the
[deploy workflow](../.github/workflows/deploy.yml) on pushes to `main`.

## Contents

- Kernels: Python (Pyodide), JavaScript (IFrame and Web Worker) and p5.js
- Widgets: ipywidgets, anywidget, bqplot, ipycanvas, ipyleaflet, ipympl and plotly
- Themes: JupyterLab Night, Cursor Dark and Cursor Light

The site has the frontend extensions of the widget libraries. Install their Python packages in the Pyodide kernel first:

```python
%pip install ipywidgets anywidget bqplot ipycanvas ipyleaflet ipympl plotly nbformat
```

`fig.show()` of plotly needs `nbformat`.

## Build locally

The extension must be built first so its prebuilt lab extension is available:

```bash
# from the repository root
jlpm install
jlpm build
```

Then build the JupyterLite site:

```bash
cd demo
uv sync
uv run jupyter lite build
```

And serve it:

```bash
uv run jupyter lite serve
```

Open the site in a Chrome with WebMCP enabled (see the [requirements](../README.md#requirements)).
