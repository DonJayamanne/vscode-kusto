import { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import * as vscode from 'vscode';
import { Client } from '../kusto/client';
import { registerDisposable } from '../utils';

export function registerRunKustoQueryTool() {
    registerDisposable(
        vscode.lm.registerTool('runKustoQuery', {
            prepareInvocation: async (args: any) => {
                const s = new vscode.MarkdownString();
                s.appendText('Run Kusto Query\n');
                s.appendCodeblock(args.input.query + '\n', 'kusto');
                s.appendText('\n');

                return {
                    invocationMessage: s
                };
            },
            invoke: async (args: any) => {
                const query = args.input.query;
                const textDocument = vscode.window.activeTextEditor?.document;
                if (!textDocument) {
                    throw new Error('No active text editor found');
                }
                const client = await Client.create(textDocument);
                if (!client) {
                    throw new Error('No client found');
                }
                try {
                    const response = await client.execute(query);

                    const data = responseToJson(response);
                    return {
                        content: [new vscode.LanguageModelTextPart(JSON.stringify(data, null, 2))]
                    };
                } catch (e: any) {
                    if (e?.innererror?.message) {
                        return {
                            content: [new vscode.LanguageModelTextPart('Error: ' + e.innererror.message)]
                        };
                    }
                    console.error('Error executing query:', e);
                    throw e;
                }
            }
        })
    );
}

function responseToJson(response: KustoResponseDataSet): unknown {
    return {
        primaryResults: response.primaryResults.map((result) => result.toJson()),
        exceptions: response.getExceptions()
    };
}
