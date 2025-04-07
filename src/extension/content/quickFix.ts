import { CodeAction, CodeActionKind, languages } from 'vscode';
import { registerDisposable } from '../utils';

export function regsisterQuickFixAction() {
    registerDisposable(
        languages.registerCodeActionsProvider(
            { scheme: 'file', language: 'kusto' },
            {
                provideCodeActions: (document, range, context) => {
                    const diagnostics = context.diagnostics
                        .filter((d) =>
                            d.message.includes('does not refer to any known table, tabular variable or function')
                        )
                        .filter((d) => d.range.contains(range));
                    if (diagnostics.length > 0) {
                        const action = new CodeAction('Configure Connection', CodeActionKind.QuickFix);
                        action.command = {
                            command: 'kusto.changeDocumentConnection',
                            title: 'Configure Connection',
                            arguments: [document.uri]
                        };
                        action.isPreferred = true;
                        action.title = 'Configure Connection';
                        action.diagnostics = diagnostics;
                        action.kind = CodeActionKind.QuickFix;
                        return [action];
                    }
                    return [];
                }
            }
        )
    );
}
