# Results

Every tool returns a JSON object. Tools do not throw for expected errors, because browsers give the agent no message for a thrown error.

## Shapes

| Result                                                   | When                                                                                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{success: true, ...}`                                   | A command result that has a boolean `success`, such as the results of jupyterlab-ai-commands. It is returned as is                                                              |
| `{success: true, result}`                                | Any other command result. Widgets, also nested ones, are described as in [`get_context`](tools.md#built-in-tools). A value that JSON cannot hold becomes a string               |
| `{success: false, error, isError: true}`                 | An unknown, blocked or failed command, an invalid input, an error in the code. When a command gives no `error`, it is made from `errorName: errorValue`, or else from `message` |
| `{status: "pending", pendingId, tool, message, dialog?}` | A dialog opened during the call, or the call runs longer than `executionTimeout`. It has no `success` field                                                                     |

These fields can be added to a result:

- `isError: true`, on every result with `success: false`. Some MCP clients report a result as an error only when it has this field.
- `warning`, on a success, when the command was not enabled when it ran (for example with no active notebook): it may have done nothing, or acted on the last active notebook or console. This is not checked when `args` has `widgetId` or `semanticWidget`. Only `notebook:*` and `console:*` commands take these arguments: for other commands, they are an error, because these commands act on the current widget.
- `dialogs`, when dialogs are open (see [dialogs](#dialogs)).
- `truncated`, `truncationNote`, `truncation` and `truncationCount`, when the result was shortened (see [bounding](#bounding)).

## Pending calls

Browser bridges wait for a tool call to return, and some run one call at a time. So a call never blocks on a dialog or on a long run:

- A call that runs longer than `executionTimeout` (20 seconds) returns `{status: "pending", pendingId, tool, message}` and continues in the background. `get_context` lists it in `pending`.
- `wait_for_result {pendingId, timeout?}` waits again, for at most `timeout` seconds and never longer than `executionTimeout`. It returns the final result, in the shape of the original tool, or a pending result again.
- When the agent or the bridge cancels a call, the command continues too: `wait_for_result` gets its result later.
- `interrupt_kernel` stops running code when the kernel supports interrupts (not Pyodide: use `restart_kernel`). The pending call then settles with a `KeyboardInterrupt` error.
- A call that returned a pending result stays available for 10 minutes after it settles. At most 50 of these settled calls are kept: the oldest ones are removed first. A running call is always kept. A call that did not return a pending result is not kept: the agent got its result.

## Dialogs

Jupyter shows one dialog at a time, and the other dialogs wait in a queue.

- Results list the open dialogs in `dialogs`, as `{id, title, body, buttons, shown, input?}`. `shown` is `false` for a queued dialog. `input` is the value of the first input field of the dialog (a boolean for a checkbox). The value of a password field is never reported.
- The extension never closes a dialog for the agent. It only reports the dialogs, and the agent answers them with `answer_dialog` (or asks the user to).
- A dialog that opens while a tool waits for exactly one call belongs to that call: the tool returns a pending result with the `dialog`. This dialog can also come from the user or from another client. When several calls are waited for, a new dialog belongs to no call. A dialog that opens while no call is waited for, such as a dialog of the user or of a call that continues in the background, also belongs to no call: it only appears in `dialogs`.
- While the dialog of a call is open and the call has not settled, `wait_for_result` returns the pending result with the `dialog` again at once. An error dialog is reported once: after that, `wait_for_result` waits for the result as usual, and a pending result after the timeout still has the `dialog`.
- A call result is always the outcome of its command. When a call settles, its dialogs stay open and appear in `dialogs`.
- An error dialog has a text body and a single button that closes it, for example `File Load Error`. When an error dialog belongs to a call, the pending result says that the call probably failed. Read the dialog, then close it with `answer_dialog`, or ask the user when the dialog does not come from this call.
- `answer_dialog {button, dialogId?}` clicks a button of the dialog that is shown, given by label (case insensitive) or by 0-based index. Input fields keep their current value.
- Without `dialogId`, `answer_dialog` needs exactly one open dialog, shown or queued. So it never clicks a dialog of the user when the dialog of the call waits behind it. A queued dialog cannot be answered: its pending result names the dialog that is shown, which must be closed first. The agent answers it with `answer_dialog` and its `dialogId` when it comes from one of its calls (for example an error dialog), else asks the user. Then it calls `wait_for_result`.
- When the dialog belongs to a call whose result the agent did not get yet, `answer_dialog` returns the result of that call (or a pending result) with `answered: {dialogId, button}`. Otherwise, it returns `{success: true, answered}`.
- After `answer_dialog` closes an error dialog of a call, it waits for that call for at most 1 second, because a call that failed often never settles. When the call has not settled by then, the pending result says so. Such a call can stay in `pending` of `get_context`.

## Bounding

A result must fit within `maxResultLength` (40000) characters of JSON.

1. Always, in MIME bundles (objects whose keys are all MIME types): binary data (images other than SVG, audio, video, `application/pdf`, `application/octet-stream`) is replaced by a placeholder such as `[omitted image/png data, 52100 characters; see text/plain]`. Other rich data longer than 2000 characters is replaced too when the bundle has `text/plain`. Values under a `metadata` key are kept. ANSI escape codes are removed from outputs.
2. When the result is still too long, these steps run in order until it fits:
   1. the strings in `outputs` and `traceback` keep a quarter of `maxResultLength` at each end (10000 characters by default);
   2. the strings in `outputs` and `traceback` keep 1000 characters at each end;
   3. all strings keep 500 characters at each end, and arrays keep 50 items;
   4. all strings keep 150 characters at each end, and arrays keep 10 items.

   Tracebacks keep their last items, where the error is. A string is cut only when it is longer than twice the kept length plus 40 characters, and its middle becomes `[... N characters omitted ...]`. Each step starts from the original result, so a value is cut only once.

3. A shortened result keeps its fields and gets `truncated: true`, a `truncationNote` for the agent, and `truncation`: the first 20 cuts, as `{path, omittedCharacters}` or `{path, omittedItems}`. `truncationCount` gives the number of cuts when there are more.
4. When the last step is not enough, the result keeps only `success`, `isError`, `status`, `pendingId` and `error` (the ones it has), with `truncated: true`, a `message` that gives the original length, and `preview`: the beginning of its JSON.

## Example

These calls and results come from JupyterLab, through the [example client](clients.md#example-client). Values are shortened with `…`.

```text
run_code {"kernelId": "6843…", "code": "import time\nfor i in range(120):\n    time.sleep(1)"}
{"status": "pending", "pendingId": "call-4", "tool": "run_code",
 "message": "The call is still running after 20 seconds and continues in the background. Call wait_for_result with this pendingId to get its result. To stop running code, interrupt the kernel."}

interrupt_kernel {"kernelId": "6843…"}
{"success": true, "kernelId": "6843…", "message": "The kernel was interrupted."}

wait_for_result {"pendingId": "call-4"}
{"success": false, "status": "error", "message": "Kernel execution failed", "errorName": "KeyboardInterrupt",
 "errorValue": "", "traceback": […], "error": "KeyboardInterrupt", "isError": true, …}

execute_command {"command_id": "notebook:restart-kernel", "args": {"semanticWidget": "id-5220…", "activate": false}}
{"status": "pending", "pendingId": "call-6", "tool": "execute_command",
 "message": "A dialog opened while the call ran, and the call probably waits for an answer. Click a button with answer_dialog (or ask the user if it is not from this call); the call then continues.",
 "dialog": {"id": "dialog-1", "title": "Restart Kernel?",
            "body": "Do you want to restart the kernel of demo.ipynb? All variables will be lost.",
            "buttons": ["Cancel", "Restart"], "shown": true}}

answer_dialog {"button": "Restart"}
{"success": true, "result": true, "answered": {"dialogId": "dialog-1", "button": "Restart"}}

run_cell {"notebook": "demo.ipynb", "cellId": "x"}
{"success": false, "error": "Unknown argument \"notebook\". Accepted arguments: \"notebookPath\", \"cellId\".", "isError": true}

run_code {"kernelId": "6843…", "code": "print('x' * 100000)"}
{"success": true, "status": "ok",
 "outputs": [{"output_type": "stream", "name": "stdout", "text": "xxx…\n[... 80001 characters omitted ...]\nxxx…"}], …,
 "truncated": true, "truncationNote": "Some values were shortened to fit the result size limit (see \"truncation\"). …",
 "truncation": [{"path": "outputs[0].text", "omittedCharacters": 80001}]}
```
