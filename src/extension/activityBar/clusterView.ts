import { commands, window, workspace } from 'vscode';
import { registerDisposable } from '../utils';
import {
    ClusterNode,
    ColumnNode,
    DatabaseNode,
    FunctionNode,
    FunctionsNode,
    InputParameterNode,
    KustoClusterExplorer,
    TableNode
} from './treeData';
import { addNewConnection } from '../kusto/connections/management';
import { getCachedConnections, onConnectionChanged } from '../kusto/connections/storage';
import { fromConnectionInfo } from '../kusto/connections';
import { createUntitledNotebook } from '../content/data';

export class ClusterTreeView {
    constructor(private readonly clusterExplorer: KustoClusterExplorer) {}
    public static register() {
        const clusterExplorer = new KustoClusterExplorer();
        registerDisposable(clusterExplorer);
        const treeView = window.createTreeView('kustoExplorer', {
            treeDataProvider: clusterExplorer,
            canSelectMany: false,
            showCollapseAll: true
        });
        registerDisposable(treeView);
        const handler = new ClusterTreeView(clusterExplorer);
        registerDisposable(commands.registerCommand('kusto.addConnection', () => addNewConnection()));
        registerDisposable(commands.registerCommand('kusto.removeConnection', handler.removeConnection, handler));
        registerDisposable(commands.registerCommand('kusto.refreshNode', handler.onRefreshNode, handler));
        registerDisposable(commands.registerCommand('kusto.createNotebook', handler.createNotebook, handler));
        registerDisposable(commands.registerCommand('kusto.viewFunctionCode', handler.viewFunctionCode, handler));
        onConnectionChanged((e) =>
            e.change === 'added'
                ? clusterExplorer.addConnection(e.connection)
                : clusterExplorer.removeCluster(e.connection)
        );
        clusterExplorer.refresh();
    }

    private async onRefreshNode(e) {
        if (e instanceof ClusterNode) {
            this.clusterExplorer.refreshConnection(e.info);
        }
        if (e instanceof DatabaseNode) {
            this.clusterExplorer.refreshConnection(e.parent.info);
        }
        if (e instanceof TableNode) {
            this.clusterExplorer.refreshConnection(e.parent.parent.info);
        }
        if (e instanceof ColumnNode) {
            this.clusterExplorer.refreshConnection(e.parent.parent.parent.info);
        }
        if (e instanceof FunctionsNode) {
            this.clusterExplorer.refreshConnection(e.parent.parent.info);
        }
        if (e instanceof FunctionNode) {
            this.clusterExplorer.refreshConnection(e.parent.parent.info);
        }
        if (e instanceof InputParameterNode) {
            this.clusterExplorer.refreshConnection(e.parent.parent.parent.info);
        }
        if (!e) {
            this.clusterExplorer.refresh();
        }
    }

    private async removeConnection(connectionNode: ClusterNode) {
        // In case this command gets added else where & I forget.
        if (!connectionNode || !(connectionNode instanceof ClusterNode)) {
            return;
        }
        const selection = await window.showWarningMessage(
            `Are you sure you want to remove the cluster ${connectionNode.info.id}`,
            {
                modal: true
            },
            'Yes'
        );
        if (selection !== 'Yes') {
            return;
        }
        const connections = getCachedConnections();
        const item = connections.find((item) => item.id === connectionNode.info.id);
        if (!item) {
            return;
        }
        await fromConnectionInfo(item).delete();
    }

    private async createNotebook(dataBaseOrTableNote: DatabaseNode | TableNode) {
        // In case this command gets added else where & I forget.
        if (
            !dataBaseOrTableNote ||
            (!(dataBaseOrTableNote instanceof DatabaseNode) && !(dataBaseOrTableNote instanceof TableNode))
        ) {
            await createUntitledNotebook(undefined, '');
            return;
        }
        const connectionInfo =
            dataBaseOrTableNote instanceof DatabaseNode
                ? dataBaseOrTableNote.parent.info
                : dataBaseOrTableNote.parent.parent.info;
        const database =
            dataBaseOrTableNote instanceof DatabaseNode
                ? dataBaseOrTableNote.database.name
                : dataBaseOrTableNote.parent.database.name;
        let cellCode = '';
        if (dataBaseOrTableNote instanceof TableNode) {
            cellCode = [dataBaseOrTableNote.table.name, '| take 1'].join('\n');
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await createUntitledNotebook({ ...connectionInfo, database } as any, cellCode);
    }
    private async viewFunctionCode(func: FunctionNode) {
        if (!func || !(func instanceof FunctionNode)) {
            return;
        }
        const code = `let ${func.function.name} = (${func.function.inputParameters
            .map((p) => `${p.name}${p.cslType || p.type ? ':' : ''}${p.cslType || p.type || ''}`)
            .join(', ')})\n${func.function.body}`;
        const doc = await workspace.openTextDocument({ language: 'kusto', content: code });
        await window.showTextDocument(doc);
    }
}
