import {
    CancellationToken,
    LanguageModelTextPart,
    LanguageModelTool,
    LanguageModelToolInvocationOptions,
    LanguageModelToolInvocationPrepareOptions,
    LanguageModelToolResult,
    lm,
    window
} from 'vscode';
import {
    getConnectionInfoFromDocumentMetadata,
    isConnectionValidForKustoQuery
} from '../kusto/connections/notebookConnection';
import { fromConnectionInfo } from '../kusto/connections';
import { Database, EngineSchema } from '../kusto/schema';
import { registerDisposable } from '../utils';
import { captureConnectionFromUser } from '../kusto/connections/management';

export function regsiterSchemaTool() {
    registerDisposable(lm.registerTool(KustoSchemaTool.Id, new KustoSchemaTool()));
}

export class KustoSchemaTool implements LanguageModelTool<any> {
    public static Id = 'kusto_schema';

    async invoke(_options: LanguageModelToolInvocationOptions<any>, _token: CancellationToken) {
        const document = window.activeTextEditor?.document || window.activeNotebookEditor?.notebook;
        if (!document) {
            return;
        }
        // If we do not have a valid connection, ask the user to select one.
        const connection = getConnectionInfoFromDocumentMetadata(document) || (await captureConnectionFromUser());
        if (!connection || !isConnectionValidForKustoQuery(connection)) {
            return;
        }
        const schema = await fromConnectionInfo(connection).getSchema();
        const value = formatSchemaForModel(schema, connection.type === 'azAuth' ? connection.database : undefined);
        return new LanguageModelToolResult([new LanguageModelTextPart(value)]);
    }

    async prepareInvocation(_options: LanguageModelToolInvocationPrepareOptions<any>, _token: CancellationToken) {
        return {
            invocationMessage: `Fetching Kusto database Schema`
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
