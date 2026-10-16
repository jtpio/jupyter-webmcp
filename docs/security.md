# Security

The settings of this extension are guardrails for agents that use its tools. They are not a sandbox.

## The browser

- **The bridge is the boundary.** Any process that can reach the Chrome debugging port controls the whole browser: it can run JavaScript in the page, read cookies, and bypass every setting of this extension. Use a dedicated browser profile, never your main one.
- **Keep the agent on the WebMCP tools.** Browser MCP servers have their own tools to run scripts and send input to the page, and these tools can do anything that the extension refuses. Remove them from chrome-devtools-mcp with its [lockdown flags](clients.md#chrome-devtools-mcp). Playwright MCP cannot remove them: deny them in the permissions of the agent.
- **Approvals.** With Playwright MCP, each page tool is a separate MCP tool, so the agent permissions can allow `webmcp_read_notebook` and ask before `webmcp_run_code`. With chrome-devtools-mcp, all calls go through `execute_webmcp_tool`. The agent of the [Model Context Tool Inspector](clients.md#model-context-tool-inspector) calls every tool without approval.
- **Scope.** Only the agents of the browser that shows the page can call its tools. A Jupyter page in a cross-origin iframe needs `allow="tools"` to register tools.

## The tools

- **Code execution is full access.** An agent that can run code (`run_code`, `run_cell`, a terminal, or a run command through `execute_command`) can do anything that the Jupyter user can do: delete files, read tokens, change the settings files.
- **`disabledTools` only hides tools.** The command of a hidden tool can still run through `execute_command`. To forbid a command, add it to `blockedCommands`. To allow only the dedicated tools, see the [examples](settings.md#examples).
- **Commands can run commands.** `blockedCommands` applies to the command that a tool runs, and hides the command from `list_all_commands`. A command that runs other commands is not checked further: menu commands run the commands of the current document, and `apputils:run-all-enabled` and `apputils:run-first-enabled` (blocked by default) run any command. Block these too, as in the [code execution example](settings.md#examples).
- **Untrusted content.** File contents, notebook outputs and command lists can contain prompt injections. The tools that return them have `untrustedContentHint`: the read tools, `run_cell`, `run_code`, `get_context`, `list_all_commands`, `execute_command`, `answer_dialog`, `wait_for_result` and `edit_cell` (the previous cell source).
- **Hints.** Tools set `readOnlyHint`, `consequentialHint` and `untrustedContentHint`. Clients decide what to do with them.
- **Dialogs.** `answer_dialog` only clicks buttons, and dialog descriptions never include the value of a password field.

## The settings

- **Put the guardrails in `overrides.json`.** Users can add entries to `blockedCommands` and `disabledTools`, but cannot remove the ones from `overrides.json`. They can still change the other settings. See [defaults for a deployment](settings.md#defaults-for-a-deployment).
- **Invalid user settings are ignored**, with their `blockedCommands`: see [defaults for a deployment](settings.md#defaults-for-a-deployment).
