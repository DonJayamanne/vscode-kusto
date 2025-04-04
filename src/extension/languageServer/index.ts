import { isEqual } from 'lodash';
import * as path from 'path';
import {
    env,
    Event,
    EventEmitter,
    ExtensionContext,
    FoldingRange,
    NotebookDocument,
    TextDocument,
    UIKind,
    window,
    workspace
} from 'vscode';
import { LanguageClientOptions } from 'vscode-languageclient';
import { LanguageClient, ServerOptions, State, TransportKind } from 'vscode-languageclient/node';
import {
    createDeferred,
    InteractiveInputScheme,
    InteractiveScheme,
    isInteractiveWindow,
    isJupyterNotebook,
    isKustoNotebook,
    NotebookCellScheme
} from '../utils';
import { fromConnectionInfo } from '../kusto/connections';
import {
    addDocumentConnectionHandler,
    getConnectionInfoFromDocumentMetadata,
    isConnectionValidForKustoQuery
} from '../kusto/connections/notebookConnection';
import { IConnectionInfo } from '../kusto/connections/types';
import { EngineSchema } from '../kusto/schema';
import { getNotebookDocument, isNotebookCell, registerDisposable } from '../utils';
import { setDocumentEngineSchema } from './browser';

const selector = [
    { language: 'kusto' },
    { language: 'kusto', scheme: 'file' },
    { language: 'kusto', scheme: 'untitled' },
    { language: 'kusto', scheme: NotebookCellScheme },
    { language: 'kusto', scheme: InteractiveScheme },
    { language: 'kusto', scheme: InteractiveInputScheme }
];

let client: LanguageClient;
const readyClient = createDeferred<LanguageClient>();
let clientIsReady: boolean | undefined;
export class FoldingRangesProvider {
    private _onDidChange = new EventEmitter<TextDocument>();
    public static instance = new FoldingRangesProvider();
    public get onDidChange(): Event<TextDocument> {
        return this._onDidChange.event;
    }
    public async getRanges(document: TextDocument | string): Promise<FoldingRange[]> {
        const lines = (typeof document === 'string' ? document : document.getText()).split(/\r?\n/g);
        const ranges: FoldingRange[] = [];
        let start: number | undefined;
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            if (line.trim().length === 0) {
                if (typeof start !== 'number') {
                    continue;
                }
                ranges.push(new FoldingRange(start, index - 1));
                start = undefined;
                continue;
            }
            if (typeof start !== 'number') {
                start = index;
            }
            if (index === lines.length - 1) {
                ranges.push(new FoldingRange(start, index));
            }
        }
        return ranges;
    }
}

export async function initialize(context: ExtensionContext) {
    if (env.uiKind === UIKind.Desktop) {
        startLanguageServer(context);
    }
    // When a notebook is opened, fetch the schema & send it.
    registerDisposable(workspace.onDidOpenNotebookDocument(sendSchemaForDocument));
    addDocumentConnectionHandler(sendSchemaForDocument);
    registerDisposable(workspace.onDidOpenTextDocument(sendSchemaForDocument));
    // Send schemas for currently opened documents as well.
    workspace.notebookDocuments.forEach(sendSchemaForDocument);
    workspace.textDocuments.forEach(sendSchemaForDocument);
}

function startLanguageServer(context: ExtensionContext) {
    // The server is implemented in node
    const serverModule = context.asAbsolutePath(path.join('out', 'server', 'server.js'));
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6012'] };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions
        }
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: selector,
        // Hijacks all LSP logs and redirect them to a specific port through WebSocket connection
        outputChannel: window.createOutputChannel('Kusto Language Server')
    };

    // Create the language client and start the client.
    client = new LanguageClient('languageServerExample', 'Language Server Example', serverOptions, clientOptions);
    registerDisposable({ dispose: () => client.stop() });
    const onDidChangeStateHandler = client.onDidChangeState((e) => {
        if (e.newState === State.Running) {
            clientIsReady = true;
            sendSchemaForDocumentsToNodeLanguageServer();
            onDidChangeStateHandler.dispose();
        }
    });
    registerDisposable(onDidChangeStateHandler);
    // Start the client. This will also launch the server
    client.start();
    client.onDidChangeState((e) => {
        if (e.newState !== State.Running) {
            return;
        }
        readyClient.resolve(client);
    });
}

const lastSentConnectionForDocument = new WeakMap<NotebookDocument | TextDocument, Partial<IConnectionInfo>>();
const pendingSchemas = new Map<NotebookDocument | TextDocument, EngineSchema>();
async function sendSchemaForDocument(document: NotebookDocument | TextDocument) {
    const notebook = getNotebookDocument(document);
    if (notebook && !isKustoNotebook(notebook) && !isJupyterNotebook(notebook) && !isInteractiveWindow(notebook)) {
        return;
    }
    // If this is a cell in a notebook, get the notebook object,
    if (
        isNotebookCell(document) &&
        notebook &&
        (isJupyterNotebook(notebook) || isKustoNotebook(notebook) || isInteractiveWindow(notebook))
    ) {
        document = notebook;
    }
    // If not a notebook, then its a text document
    // If textdocument & language is not kusto, then ignore this.
    if (
        !isNotebookCell(document) &&
        !notebook &&
        'languageId' in document &&
        document.languageId.toLowerCase() !== 'kusto'
    ) {
        return;
    }
    const info = getConnectionInfoFromDocumentMetadata(document);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!info || !shouldSendSchemaToLanguageServer(document, info as any)) {
        return;
    }
    lastSentConnectionForDocument.set(document, info);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engineSchema = await fromConnectionInfo(info as any).getSchema({ hideProgress: true });
    const clone: EngineSchema = JSON.parse(JSON.stringify(engineSchema));
    if ('database' in info) {
        clone.database = engineSchema.cluster.databases.find(
            (item) => item.name.toLowerCase() === info.database?.toLowerCase()
        );
    }
    if (!clone.database && engineSchema.cluster.databases.length) {
        clone.database = engineSchema.cluster.databases[0];
    }
    pendingSchemas.set(document, clone);
    lastSentConnectionForDocument.set(document, info);
    sendSchemaForDocuments();
}
function shouldSendSchemaToLanguageServer(document: NotebookDocument | TextDocument, info: IConnectionInfo) {
    if (!isConnectionValidForKustoQuery(info)) {
        return false;
    }
    const lastSent = lastSentConnectionForDocument.get(document);
    return lastSent && isEqual(lastSent, info) ? false : true;
}
function sendSchemaForDocuments() {
    if (env.uiKind === UIKind.Desktop) {
        sendSchemaForDocumentsToNodeLanguageServer();
    } else {
        sendSchemaForDocumentsToWebLanguageServer();
    }
}
function sendSchemaForDocumentsToWebLanguageServer() {
    const sentSchemas = new Set<string>();
    pendingSchemas.forEach((engineSchema, documentOrNotebook) => {
        const message = `Sending schema for ${documentOrNotebook} ${engineSchema.cluster.connectionString}: ${engineSchema.database?.name}`;
        if (sentSchemas.has(message)) {
            return;
        }
        sentSchemas.add(message);
        setDocumentEngineSchema(documentOrNotebook, engineSchema);
    });
    pendingSchemas.clear();
}

function sendSchemaForDocumentsToNodeLanguageServer() {
    if (!client || !clientIsReady) {
        return;
    }
    const sentSchemas = new Set<string>();
    pendingSchemas.forEach((engineSchema, documentOrNotebook) => {
        const message = `Sending schema for ${documentOrNotebook} ${engineSchema.cluster.connectionString}: ${engineSchema.database?.name}`;
        if (sentSchemas.has(message)) {
            return;
        }
        client.sendNotification('setSchema', {
            uri: documentOrNotebook.uri.toString(),
            engineSchema
        });
    });
    pendingSchemas.clear();
}
