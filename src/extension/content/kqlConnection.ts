import { workspace } from 'vscode';
import { registerDisposable } from '../utils';
import {
    getConnectionInfoFromDocumentMetadata,
    isConnectionValidForKustoQuery,
    updateNotebookConnection
} from '../kusto/connections/notebookConnection';
import { selectConnectionController } from '../kernel/connectionPicker';

export function registerKqlNotebookConnectionHandler() {
    registerDisposable(
        workspace.onDidOpenNotebookDocument(async (doc) => {
            if (doc.notebookType !== 'kusto-notebook-kql') {
                return;
            }
            const connection = await getConnectionInfoFromDocumentMetadata(doc);
            if (!connection || !isConnectionValidForKustoQuery(connection)) {
                return;
            }
            await updateNotebookConnection(doc, connection);
            await selectConnectionController(doc, connection);
        })
    );
}
