import {
    CancellationToken,
    Disposable,
    Event,
    EventEmitter,
    NotebookDocument,
    NotebookVariableProvider,
    NotebookVariablesRequestKind,
    Variable,
    VariablesResult
} from 'vscode';
import {
    addDocumentConnectionHandler,
    getConnectionInfoFromDocumentMetadata,
    isConnectionValidForKustoQuery
} from '../kusto/connections/notebookConnection';
import { fromConnectionInfo } from '../kusto/connections';
import { Database, EngineSchema } from '../kusto/schema';
import { isNotebookDocument } from '../utils';

export class VariableProvider implements Disposable, NotebookVariableProvider {
    private readonly disposables: Disposable[] = [];
    private readonly _onDidChangeVariables = new EventEmitter<NotebookDocument>();
    public get onDidChangeVariables(): Event<NotebookDocument> {
        return this._onDidChangeVariables.event;
    }

    constructor() {
        this.disposables.push(this._onDidChangeVariables);
        addDocumentConnectionHandler((document) => {
            if (isNotebookDocument(document)) {
                this._onDidChangeVariables.fire(document);
            }
        });
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }

    public async *provideVariables(
        notebook: NotebookDocument,
        _parent: Variable | undefined,
        kind: NotebookVariablesRequestKind,
        _start: number,
        _token: CancellationToken
    ): AsyncIterable<VariablesResult> {
        if (kind !== NotebookVariablesRequestKind.Named) {
            return;
        }

        const connection = getConnectionInfoFromDocumentMetadata(notebook);
        if (!connection || !isConnectionValidForKustoQuery(connection)) {
            return;
        }
        const schema = await fromConnectionInfo(connection).getSchema();
        const value = formatSchemaForModel(schema, connection.type === 'azAuth' ? connection.database : undefined);
        yield {
            variable: {
                name: 'kustoSchema',
                value,
                type: 'string'
            },
            hasNamedChildren: false,
            indexedChildrenCount: 0
        };
    }
}

export function formatSchemaForModel(schema: EngineSchema, activeDatabase?: string): string {
    if (schema.cluster.databases.length === 0) {
        return '';
    }

    const lines: string[] = ['\n'];
    activeDatabase = activeDatabase || schema.cluster.databases[0].name;
    schema.cluster.databases
        .filter((db) => db.name === activeDatabase)
        .forEach((database) => {
            lines.push(formatDatabaseForModel(database));
        });
    return lines.join('\n');
}

function formatDatabaseForModel(database: Database): string {
    const lines: string[] = ['', ''];
    lines.push(`Below is a list of tables and functions in the Kusto database ${database.name}.`);
    lines.push('<tables>');
    database.tables.forEach((table, i) => {
        lines.push(`${i + 1}. ${table.name}(${table.columns.map((col) => `${col.name}:${col.type}`).join(', ')})`);
    });
    lines.push('</tables>');
    lines.push('<functions>');
    database.functions.forEach((func, i) => {
        lines.push(
            `${i + 1}. ${func.name}=(${func.inputParameters.map((arg) => `${arg.name}:${arg.type}`).join(', ')})`
        );
    });
    lines.push('</functions>');
    lines.push();
    lines.push();

    return lines.join('\n');
}
