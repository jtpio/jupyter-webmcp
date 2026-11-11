# API for other extensions

Most extensions do not need an API: add a command with a caption and `describedBy` arguments. Agents find it with `list_all_commands` and run it with `execute_command`, with the [result protocol](results.md) and `blockedCommands`. Users and admins can also give it a dedicated tool with a [`tools` entry](settings.md#tool-specs), which adds the input checks.

To register a tool directly, use the `IWebMCPRegistry` token.

## IWebMCPRegistry

```ts
interface IWebMCPRegistry {
  readonly isAvailable: boolean;
  readonly toolNames: readonly string[];
  readonly changed: ISignal<IWebMCPRegistry, void>;
  registerTool(tool: IModelContextTool): Promise<IDisposable>;
}
```

- `isAvailable`: whether the browser exposes WebMCP (`document.modelContext`) for this page.
- `toolNames`: the names of the tools registered through the registry, sorted. They include the tools of this extension.
- `changed`: emitted when a tool is registered or removed.
- `registerTool(tool)`: registers a WebMCP tool. It rejects when WebMCP is not available, when the name is taken, or when the browser refuses the tool. Dispose the result to remove the tool.

The package also exports the WebMCP typings (`IModelContextTool`, `IToolAnnotations`, `IToolExecuteOptions`, `IModelContext`, `getModelContext`) and the `ICommandToolSpec` type of a `tools` entry.

## Example

Use the token as an optional dependency, so that your extension still starts without WebMCP:

```ts
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IWebMCPRegistry } from 'jupyter-webmcp';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'my-extension:webmcp',
  description: 'Adds a WebMCP tool that counts the open notebooks.',
  autoStart: true,
  optional: [IWebMCPRegistry],
  activate: (app: JupyterFrontEnd, registry: IWebMCPRegistry | null) => {
    if (!registry?.isAvailable) {
      return;
    }
    registry
      .registerTool({
        name: 'count_notebooks',
        description: 'Count the notebooks open in the main area.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
        execute: () => ({
          success: true,
          count: Array.from(app.shell.widgets('main')).filter(widget =>
            widget.hasClass('jp-NotebookPanel')
          ).length
        })
      })
      .catch(reason => console.warn('count_notebooks', reason));
  }
};

export default plugin;
```

Tools registered this way get no input checks, no bounding and no pending results, and `disabledTools` and `blockedCommands` do not apply to them. So:

- return errors as data, for example `{success: false, error, isError: true}`, instead of throwing (see [results](results.md));
- give an `outputSchema` only when all the results match it, also the errors: agents can refuse a result that does not match. Chrome 159 and later report the `outputSchema` to agents, and earlier versions ignore it;
- use names of at most 64 letters, digits and `_`: some MCP clients cut longer names or change other characters, such as `-` and `.`;
- do not use the names of the built-in and default tools: when your tool takes one first, the tool of this extension is not registered.

## Shared package

Your extension must use the token object that jupyter-webmcp provides. Add `jupyter-webmcp` to the dependencies of your package, and share it as a singleton without bundling it, in `package.json`:

```json
"jupyterlab": {
  "sharedPackages": {
    "jupyter-webmcp": { "bundled": false, "singleton": true }
  }
}
```

A bundled copy gives a different token, and the registry is then `null`. Without a bundled copy, jupyter-webmcp must be installed: add `jupyter_webmcp` to the Python dependencies of your extension.
