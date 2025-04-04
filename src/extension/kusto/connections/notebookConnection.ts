import {
    EventEmitter,
    NotebookCell,
    NotebookCellKind,
    NotebookDocumentChangeEvent,
    NotebookEdit,
    TextDocument,
    window
} from 'vscode';
import { commands, NotebookDocument, Uri, workspace, WorkspaceEdit } from 'vscode';
import { IConnectionInfo } from './types';
import { isInteractiveWindow, isNotebookDocument, registerDisposable } from '../../utils';
import { isJupyterNotebook, getJupyterNotebook, isKustoNotebook, getKustoNotebook } from '../../utils';
import { isEqual } from 'lodash';
import { captureConnectionFromUser } from './management';
import { getFromGlobalCache, updateGlobalCache } from '../../cache';
import { getConnectionFromNotebookMetadata, updateMetadataWithConnectionInfo } from '../../content/data';
import { GlobalMementoKeys, useProposedApi } from '../../constants';
import { AzureAuthenticatedConnection } from './azAuth';

const onDidChangeConnection = new EventEmitter<NotebookDocument | TextDocument>();

export function registerNotebookConnection() {
    registerDisposable(onDidChangeConnection);
    registerDisposable(commands.registerCommand('kusto.changeDocumentConnection', changDocumentConnection));
    if (useProposedApi()) {
        registerDisposable(workspace.onDidChangeNotebookDocument(onDidChangeJupyterNotebookCells));
    }
    registerDisposable(workspace.onDidChangeTextDocument((e) => onDidChangeJupyterNotebookCell(e.document)));
}
export function addDocumentConnectionHandler(cb: (document: NotebookDocument | TextDocument) => void) {
    registerDisposable(onDidChangeConnection.event(cb));
}
export async function ensureDocumentHasConnectionInfo(
    document: NotebookDocument | TextDocument
): Promise<IConnectionInfo | undefined> {
    if ('notebookType' in document) {
        return ensureNotebookHasConnectionInfoInternal(document, false);
    } else {
        return ensureDocumentHasConnectionInfoInternal(document, false);
    }
}
export function isConnectionValidForKustoQuery(connection: Partial<IConnectionInfo>): connection is IConnectionInfo {
    switch (connection.type) {
        case 'azAuth':
            return connection.cluster && connection.database ? true : false;
        case 'appInsights':
            return connection.id ? true : false;
        default:
            return 'cluster' in connection && connection.cluster && 'database' in connection && connection.database
                ? true
                : false;
    }
}
export async function ensureNotebookHasConnectionInfoInternal(
    document: NotebookDocument | TextDocument,
    changeExistingValue = false
): Promise<IConnectionInfo | undefined> {
    const currentInfo = getConnectionInfoFromDocumentMetadata(document, changeExistingValue);
    if (!changeExistingValue && currentInfo && isConnectionValidForKustoQuery(currentInfo)) {
        return currentInfo as IConnectionInfo;
    }
    if (
        isNotebookDocument(document) &&
        !isKustoNotebook(document) &&
        !isJupyterNotebook(document) &&
        !isInteractiveWindow(document)
    ) {
        return;
    }
    const info = await captureConnectionFromUser(getConnectionInfoFromDocumentMetadata(document));
    if (!info || !isConnectionValidForKustoQuery(info)) {
        return;
    }
    if (isNotebookDocument(document) && isKustoNotebook(document)) {
        await updateNotebookConnection(document, info);
    } else {
        await updateGlobalCache(document.uri.toString().toLowerCase(), info);
    }
    await updateGlobalCache(GlobalMementoKeys.lastUsedConnection, info);
    return info;
}
async function ensureDocumentHasConnectionInfoInternal(
    document: TextDocument,
    changeExistingValue = false
): Promise<IConnectionInfo | undefined> {
    const currentInfo = getConnectionInfoFromDocumentMetadata(document);
    if (!changeExistingValue && currentInfo && isConnectionValidForKustoQuery(currentInfo)) {
        return currentInfo as IConnectionInfo;
    }
    const info = await captureConnectionFromUser(getConnectionInfoFromDocumentMetadata(document));
    if (!info || !isConnectionValidForKustoQuery(info)) {
        return;
    }
    if (isEqual(currentInfo, info)) {
        return;
    }
    await updateGlobalCache(document.uri.toString().toLowerCase(), info);
    await updateGlobalCache(GlobalMementoKeys.lastUsedConnection, info);
    onDidChangeConnection.fire(document);
    return info;
}
async function changDocumentConnection(uri?: Uri) {
    uri = uri || window.activeNotebookEditor?.notebook?.uri;
    if (!uri) {
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const document = workspace.notebookDocuments.find((item) => item.uri.toString() === uri!.toString());
    if (document) {
        await ensureNotebookHasConnectionInfoInternal(document, true);
    } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const textDocument = workspace.textDocuments.find((item) => item.uri.toString() === uri!.toString());
        if (!textDocument) {
            return;
        }
        await ensureDocumentHasConnectionInfoInternal(textDocument, true);
    }
}
function onDidChangeJupyterNotebookCells(e: NotebookDocumentChangeEvent) {
    if (!isJupyterNotebook(e.notebook)) {
        return;
    }
    if (e.cellChanges.some((item) => getJupyterCellWithConnectionInfo([item.cell]))) {
        // Ok we know the cell containing the connection string changed.
        getConnectionInfoFromJupyterNotebook(e.notebook);
        triggerJupyterConnectionChanged(e.notebook);
    }
}
function onDidChangeJupyterNotebookCell(textDocument: TextDocument) {
    const notebook = getJupyterNotebook(textDocument);

    if (notebook && textDocumentHasJupyterConnectionInfo(textDocument)) {
        // Ok we know the cell containing the connection string changed.
        getConnectionInfoFromJupyterNotebook(notebook);
        triggerJupyterConnectionChanged(notebook);
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const triggerTimeouts = new WeakMap<NotebookDocument, any>();
function triggerJupyterConnectionChanged(notebook: NotebookDocument) {
    let timeout = triggerTimeouts.get(notebook);
    if (timeout) {
        clearTimeout(timeout);
    }
    // Trigger a change after 0.5s, possible user is still typing in the cell.
    timeout = setTimeout(() => onDidChangeConnection.fire(notebook), 500);
}
export function getConnectionInfoFromDocumentMetadata(
    document: NotebookDocument | TextDocument,
    ignoreCache = false
): Partial<IConnectionInfo> | undefined {
    // If user manually chose a connection, then use that.
    let connection = getFromGlobalCache<IConnectionInfo>(document.uri.toString().toLowerCase());
    if (connection) {
        return connection;
    }
    let notebook: NotebookDocument | undefined;
    if ('notebookType' in document) {
        notebook = document;
    } else {
        notebook = getJupyterNotebook(document) || getKustoNotebook(document);
    }
    if (notebook) {
        if (isJupyterNotebook(notebook)) {
            connection = getConnectionInfoFromJupyterNotebook(notebook);
        } else {
            connection = getConnectionFromNotebookMetadata(notebook);
        }
    } else {
        connection = getFromGlobalCache<IConnectionInfo>(document.uri.toString().toLowerCase());
    }
    if (connection && !getFromGlobalCache(GlobalMementoKeys.lastUsedConnection)) {
        // If we have a preferred connection, and user hasn't ever selected a connection (before),
        // then use current connection as the preferred connection for future notebooks/kusto files.
        updateGlobalCache(GlobalMementoKeys.lastUsedConnection, connection);
    }
    if (ignoreCache) {
        return connection;
    }
    return connection || getFromGlobalCache(GlobalMementoKeys.lastUsedConnection);
}
const kqlMagicConnectionStringStartDelimiter = 'AzureDataExplorer://'.toLowerCase();
function textDocumentHasJupyterConnectionInfo(textDocument: TextDocument) {
    return (
        textDocument.lineAt(0).text.startsWith('%kql') &&
        textDocument.lineAt(0).text.toLowerCase().includes(kqlMagicConnectionStringStartDelimiter)
    );
}
function getJupyterCellWithConnectionInfo(cells: readonly NotebookCell[]) {
    return cells
        .filter((item) => item.kind === NotebookCellKind.Code)
        .find((item) => textDocumentHasJupyterConnectionInfo(item.document));
}
const jupyterNotebookClusterAndDb = new WeakMap<NotebookDocument, { cluster?: string; database?: string }>();
/**
 * This assumes you are always working with Microsoft AZ Authentication.
 * kql supports non AZ `tenant`, but this extension currently does not.
 */
function getConnectionInfoFromJupyterNotebook(document: NotebookDocument): IConnectionInfo | undefined {
    // %kql azureDataExplorer://code;cluster='help';database='Samples'
    if (!isJupyterNotebook(document)) {
        return;
    }
    const cell = getJupyterCellWithConnectionInfo(document.getCells());
    if (!cell) {
        return;
    }
    const text = cell.document
        .lineAt(0)
        .text.substring(
            cell.document.lineAt(0).text.indexOf(kqlMagicConnectionStringStartDelimiter) +
                kqlMagicConnectionStringStartDelimiter.length
        )
        .toLowerCase();
    const delimiter = text.includes("'") ? "'" : '"';
    // 'help';database='Samples'
    const parts = text.replace(/\s+/g, '').split(delimiter);
    try {
        const clusterIndex = parts.findIndex((item) => item.endsWith('cluster='));
        const databaseIndex = parts.findIndex((item) => item.endsWith('database='));
        const clusterUri = `https://${parts[clusterIndex + 1]}.kusto.windows.net`;
        const database = parts[databaseIndex + 1];
        // console.debug(`Parsed ${text} & got ${clusterUri} & ${database}`);
        const info = AzureAuthenticatedConnection.connectionInfofrom({ cluster: clusterUri, database });
        jupyterNotebookClusterAndDb.set(document, info);
        return info;
    } catch (ex) {
        console.error(`Failed to parse ${text} to get cluster & db`, ex);
        return;
    }
}
export async function updateNotebookConnection(document: NotebookDocument, info: IConnectionInfo) {
    if (isJupyterNotebook(document) || !isKustoNotebook(document)) {
        console.error('oops');
        return;
    }
    try {
        const edit = new WorkspaceEdit();
        const metadata = JSON.parse(JSON.stringify(document.metadata)) || {};
        updateMetadataWithConnectionInfo(metadata, info);
        const nbEdit = NotebookEdit.updateNotebookMetadata(metadata);
        edit.set(document.uri, [nbEdit]);
        await workspace.applyEdit(edit);
        onDidChangeConnection.fire(document);
    } catch (ex) {
        console.error('Failed in updateNotebookConnection', ex);
    }
}
