import { CancellationTokenSource, commands, NotebookDocument, workspace } from 'vscode';
import { AzureAuthenticatedConnection } from '../kusto/connections/azAuth';
import { IConnectionInfo } from '../kusto/connections/types';
import { ContentProvider, KustoNotebook } from './provider';
import { encoder } from './utils';
import { isConnectionValidForKustoQuery, updateNotebookConnection } from '../kusto/connections/notebookConnection';
import { GlobalMementoKeys } from '../constants';
import { getFromGlobalCache, updateGlobalCache } from '../cache';
import { selectConnectionController } from '../kernel/connectionPicker';

type KustoNotebookConnectionMetadata =
    | {
          cluster: string;
          database: string;
      }
    | { appInsightsId: string };
type KustoNotebookMetadata = {
    locked?: boolean;
    connection?: KustoNotebookConnectionMetadata;
};

export function getNotebookMetadata(connection?: IConnectionInfo) {
    const notebookMetadata: KustoNotebookMetadata = {};
    if (connection) {
        switch (connection.type) {
            case 'azAuth':
                notebookMetadata.connection = {
                    cluster: connection.cluster,
                    database: connection.database || ''
                };
                break;
            case 'appInsights':
                notebookMetadata.connection = {
                    appInsightsId: connection.id
                };
        }
    }
    return notebookMetadata;
}
export function getConnectionFromNotebookMetadata(document: NotebookDocument) {
    const metadata: KustoNotebookMetadata = document.metadata;
    const connection = metadata?.connection;
    if (connection) {
        if ('cluster' in connection) {
            return AzureAuthenticatedConnection.connectionInfofrom(connection);
        }
    }

    if (document.notebookType === 'kusto-notebook-kql') {
        return getFromGlobalCache<IConnectionInfo>(document.uri.toString().toLowerCase());
    }
}

export async function createUntitledNotebook(connection?: IConnectionInfo, cellText?: string) {
    const contents: KustoNotebook = {
        // We don't want to create an empty notebook (add at least one blank cell)
        cells: [{ kind: 'code', source: cellText || '', outputs: [] }],
        metadata: getNotebookMetadata(connection)
    };
    const data = await new ContentProvider(false).deserializeNotebook(
        encoder.encode(JSON.stringify(contents)),
        new CancellationTokenSource().token
    );
    const doc = await workspace.openNotebookDocument('kusto-notebook', data);
    await commands.executeCommand('vscode.openWith', doc.uri, 'kusto-notebook');
    if (connection && isConnectionValidForKustoQuery(connection)) {
        await updateNotebookConnection(doc, connection);
        await updateGlobalCache(doc.uri.toString().toLowerCase(), connection);
        await updateGlobalCache(GlobalMementoKeys.lastUsedConnection, connection);
        await selectConnectionController(doc, connection);
    }
}

export function updateMetadataWithConnectionInfo(metadata: Record<string, unknown>, connection?: IConnectionInfo) {
    metadata.connection = connection ? JSON.parse(JSON.stringify(connection)) : undefined;
}
export function getConnectionFromMetadata(metadata: Record<string, unknown>, connection?: IConnectionInfo) {
    metadata.connection = connection ? JSON.parse(JSON.stringify(connection)) : undefined;
}
