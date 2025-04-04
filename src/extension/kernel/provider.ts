import {
    NotebookDocument,
    notebooks,
    NotebookCell,
    NotebookCellOutput,
    NotebookCellOutputItem,
    WorkspaceEdit,
    NotebookController,
    Disposable,
    NotebookEdit,
    TextDocument
} from 'vscode';
import { Client } from '../kusto/client';
import { getChartType } from '../output/chart';
import { createPromiseFromToken, InteractiveWindowView, registerDisposable } from '../utils';
import { encodeConnectionInfo, getDisplayInfo, IConnectionInfo } from '../kusto/connections/types';
import { getLastUsedConnections } from './usedConnections';
import { updateNotebookConnection } from '../kusto/connections/notebookConnection';
import { VariableProvider } from './variables';

const registeredControllers: KernelPerConnection[] = [];
const variableProvider = new VariableProvider();
export class KernelProvider {
    public static register() {
        registerDisposable(variableProvider);
        const lastUsedConnection = getLastUsedConnections();
        lastUsedConnection.forEach((connection) => {
            registerDisposable(registerController('kusto-notebook', connection));
            registerDisposable(registerController('kusto-notebook-kql', connection));
            registerDisposable(registerController(InteractiveWindowView, connection));
        });
    }
}

export function registerController(notebookType: string, connection: IConnectionInfo) {
    const controllerId = getControllerId(connection, notebookType);
    const existingController = registeredControllers.find(
        (controller) =>
            controller.notebookController.id === controllerId &&
            controller.notebookController.notebookType === notebookType
    );
    if (existingController) {
        return existingController;
    }
    const controller = new KernelPerConnection(notebookType, connection);
    registeredControllers.push(controller);
    registerDisposable(controller);
    return controller;
}

function getControllerId(connection: IConnectionInfo, notebookType: string) {
    return `${notebookType}_${encodeConnectionInfo(connection)}`;
}

export class KernelPerConnection extends Disposable {
    public readonly notebookController: NotebookController;
    private readonly disposables: Disposable[] = [];
    constructor(notebookType: string, private readonly connection: IConnectionInfo) {
        super(() => {
            this.dispose();
        });
        const displayInfo = getDisplayInfo(this.connection);
        this.notebookController = notebooks.createNotebookController(
            getControllerId(connection, notebookType),
            notebookType,
            displayInfo.label,
            this.execute.bind(this)
        );
        this.notebookController.supportedLanguages = ['kusto'];
        this.notebookController.supportsExecutionOrder = true;
        this.notebookController.description = displayInfo.description;
        this.notebookController.variableProvider = variableProvider;
        this.disposables.push(
            this.notebookController.onDidChangeSelectedNotebooks(({ notebook, selected }) => {
                if (!selected) {
                    return;
                }
                updateNotebookConnection(notebook, this.connection);
            })
        );
    }

    dispose() {
        this.disposables.forEach((disposable) => disposable.dispose());
    }

    public executeInteractive(cells: NotebookCell[], textDocument: TextDocument) {
        cells.forEach((cell) => {
            this.executeCell(cell, this.notebookController, textDocument);
        });
    }

    public execute(cells: NotebookCell[], _notebook: NotebookDocument, controller: NotebookController) {
        cells.forEach((cell) => {
            this.executeCell(cell, controller);
        });
    }

    private async executeCell(
        cell: NotebookCell,
        controller: NotebookController,
        textDocument?: TextDocument
    ): Promise<void> {
        const task = controller.createNotebookCellExecution(cell);
        const client = await Client.create(textDocument || cell.notebook, this.connection);
        if (!client) {
            task.end(false);
            return;
        }
        const edit = new WorkspaceEdit();
        const newMetadata = {
            ...cell.metadata,
            statusMessage: ''
        };
        const cellEdit = NotebookEdit.updateCellMetadata(cell.index, newMetadata);
        edit.set(cell.notebook.uri, [cellEdit]);
        // const promise = workspace.applyEdit(edit);
        task.start(Date.now());
        task.clearOutput();
        let success = false;
        try {
            const results = await Promise.race([
                createPromiseFromToken(task.token, { action: 'resolve', value: undefined }),
                client.execute(cell.document.getText())
            ]);
            if (task.token.isCancellationRequested || !results) {
                return;
            }
            success = true;
            // promise.then(() => {
            //     const rowCount = results.primaryResults.length ? results.primaryResults[0]._rows.length : undefined;
            //     if (rowCount) {
            //         const edit = new WorkspaceEdit();
            //         const nbEdit = NotebookEdit.updateCellMetadata(cell.index, {
            //             statusMessage: `${rowCount} records`
            //         });
            //         edit.set(cell.notebook.uri, [nbEdit]);
            //         workspace.applyEdit(edit);
            //     }
            // });

            // Dump the primary results table from the list of tables.
            // We already have that information as a seprate property name `primaryResults`.
            // This will reduce the amount of JSON (save) in knb file.
            if (!Array.isArray(results.primaryResults) || results.primaryResults.length === 0) {
                results.primaryResults = results.tables.filter((item) => item.name === 'PrimaryResult');
            }
            const chartType = getChartType(results);
            results.tables = results.tables.filter((item) => item.name !== 'PrimaryResult');
            results.tableNames = results.tableNames.filter((item) => item !== 'PrimaryResult');

            const outputItems: NotebookCellOutputItem[] = [];
            if (chartType && chartType !== 'table') {
                outputItems.push(NotebookCellOutputItem.json(results, 'application/vnd.kusto.result.viz+json'));
            } else {
                outputItems.push(NotebookCellOutputItem.json(results, 'application/vnd.kusto.result+json'));
            }
            task.appendOutput(new NotebookCellOutput(outputItems));
        } catch (ex) {
            console.error('Failed to execute query', ex);
            if (!ex) {
                const error = new Error('Failed to execute query');
                task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.error(error)]));
            } else if (ex instanceof Error && ex) {
                task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.error(ex)]));
            } else if (ex && typeof ex === 'object' && 'message' in ex) {
                const innerError =
                    'innererror' in ex &&
                    typeof ex.innererror === 'object' &&
                    ex.innererror &&
                    'message' in ex.innererror &&
                    ex.innererror.message
                        ? ` (${ex.innererror.message})`
                        : '';
                const message = `${ex.message}${innerError}`;
                task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.error({ message, name: '' })]));
            } else {
                const error = new Error('Failed to execute query');
                task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.error(error)]));
            }
        } finally {
            task.end(success, Date.now());
        }
    }
}
