import { NotebookDocument, notebooks, NotebookCell, NotebookController, Disposable, commands, window } from 'vscode';
import { ensureNotebookHasConnectionInfoInternal } from '../kusto/connections/notebookConnection';
import { updateLastUsedControllerConnections } from './usedConnections';
import { registerController } from './provider';
import { InteractiveWindowView, registerDisposable } from '../utils';
import { IConnectionInfo } from '../kusto/connections/types';

export function registerKernelPicker() {
    registerDisposable(new KernelPicker('kusto-notebook'));
    registerDisposable(new KernelPicker('kusto-notebook-kql'));
    registerDisposable(new KernelPicker(InteractiveWindowView));
}

export class KernelPicker extends Disposable {
    private notebookController?: NotebookController;
    constructor(private readonly notebookType: string) {
        super(() => {
            this.dispose();
        });
        this.createController();
    }

    private createController() {
        this.notebookController?.dispose();
        this.notebookController = this.createNotebookController();
    }
    dispose() {
        this.notebookController?.dispose();
    }

    private createNotebookController() {
        // Create a dynamic controller, so that VSCode will never remember this.
        const id = `${this.notebookType}${new Date().getTime()}`;
        const controller = notebooks.createNotebookController(
            id,
            this.notebookType,
            '$(database) Select a new Kusto Connection',
            this.execute.bind(this)
        );
        controller.supportedLanguages = ['kusto'];
        controller.supportsExecutionOrder = true;
        controller.description = 'Select and Configure a new Kusto Connection';
        controller.onDidChangeSelectedNotebooks(async ({ notebook, selected }) => {
            if (!selected) {
                return;
            }
            try {
                const info = await ensureNotebookHasConnectionInfoInternal(notebook, true);
                if (!info) {
                    return;
                }
                await selectConnectionController(notebook, info);
            } catch (ex) {
                console.error('Error selecting kernel', ex);
            } finally {
                // Delete this controller and create a new one.
                // Remember, this controller is used only as a picker placeholder.
                this.createController();
            }
        });
        return controller;
    }
    public execute(_cells: NotebookCell[], _notebook: NotebookDocument, _controller: NotebookController) {
        //
    }
}

export async function selectConnectionController(notebook: NotebookDocument, connection: IConnectionInfo) {
    const controller = registerController(notebook.notebookType, connection).notebookController;
    const commandArgs = {
        id: controller.id,
        extension: 'donjayamanne.kusto'
    };
    if (window.activeNotebookEditor?.notebook === notebook) {
        commandArgs['notebookEditor'] = window.activeNotebookEditor;
    }
    updateLastUsedControllerConnections(connection);
    const result = await commands.executeCommand('notebook.selectKernel', commandArgs);
    console.log('Kernel selected', result);
}
