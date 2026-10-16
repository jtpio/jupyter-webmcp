import {
  ILabShell,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { Dialog, ICommandPalette, showDialog } from '@jupyterlab/apputils';
import { IDefaultFileBrowser } from '@jupyterlab/filebrowser';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IStatusBar } from '@jupyterlab/statusbar';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { CommandIDs, LOG_PREFIX, PLUGIN_ID } from './commands';
import { KernelCommands } from './kernels';
import { ToolManager } from './manager';
import { getModelContext } from './modelcontext';
import { WebMCPRegistry } from './registry';
import { IWebMCPRegistry } from './tokens';
import { ToolList, WebMCPStatus, unavailableHint } from './widgets';

export * from './modelcontext';
export * from './tokens';
export type { ICommandToolSpec } from './specs';

/**
 * The translation domain of the extension.
 */
const DOMAIN = 'jupyter_webmcp';

/**
 * The main plugin, exposing commands as WebMCP tools.
 */
const plugin: JupyterFrontEndPlugin<IWebMCPRegistry> = {
  id: PLUGIN_ID,
  description:
    'Provides the WebMCP tool registry and exposes commands to browser agents as WebMCP tools.',
  autoStart: true,
  provides: IWebMCPRegistry,
  requires: [ISettingRegistry],
  optional: [ICommandPalette, ITranslator, IDefaultFileBrowser, ILabShell],
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry,
    palette: ICommandPalette | null,
    translator: ITranslator | null,
    fileBrowser: IDefaultFileBrowser | null,
    labShell: ILabShell | null
  ): IWebMCPRegistry => {
    const trans = (translator ?? nullTranslator).load(DOMAIN);
    const modelContext = getModelContext();
    const registry = new WebMCPRegistry(modelContext);
    const manager = new ToolManager({
      app,
      registry,
      trans,
      fileBrowser,
      labShell
    });

    KernelCommands.addCommands(app, trans);

    app.commands.addCommand(CommandIDs.showTools, {
      label: trans.__('Show WebMCP Tools'),
      caption: trans.__('List the WebMCP tools of this page'),
      describedBy: { args: { type: 'object', properties: {} } },
      execute: () =>
        showDialog({
          title: trans.__('WebMCP Tools'),
          body: new ToolList({ registry, manager, trans }),
          buttons: [Dialog.cancelButton({ label: trans.__('Close') })]
        })
    });
    palette?.addItem({
      command: CommandIDs.showTools,
      category: trans.__('WebMCP')
    });

    if (!modelContext) {
      console.debug(
        `${LOG_PREFIX} ${unavailableHint(nullTranslator.load(DOMAIN))}`
      );
      return registry;
    }

    Promise.all([app.restored, settingRegistry.load(PLUGIN_ID)])
      .then(
        ([, settings]) => manager.start(settings),
        reason => {
          console.error(
            `${LOG_PREFIX} The settings could not be loaded, no tool is registered:`,
            reason
          );
          manager.fail(reason);
        }
      )
      .catch(reason => {
        console.error(`${LOG_PREFIX} The tools could not be started:`, reason);
        manager.fail(reason);
      });

    return registry;
  }
};

/**
 * The status bar item showing the number of WebMCP tools.
 */
const status: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-webmcp:status',
  description: 'Adds a status bar item with the number of WebMCP tools.',
  autoStart: true,
  requires: [IWebMCPRegistry],
  optional: [IStatusBar, ITranslator],
  activate: (
    app: JupyterFrontEnd,
    registry: IWebMCPRegistry,
    statusBar: IStatusBar | null,
    translator: ITranslator | null
  ): void => {
    if (!statusBar) {
      return;
    }
    const trans = (translator ?? nullTranslator).load(DOMAIN);
    statusBar.registerStatusItem(status.id, {
      item: new WebMCPStatus({ registry, commands: app.commands, trans }),
      align: 'left',
      rank: 5
    });
  }
};

export default [plugin, status];
