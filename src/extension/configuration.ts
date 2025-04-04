import * as vscode from 'vscode';
import { registerDisposable } from './utils';

export function registerConfigurationListener() {
    registerDisposable(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('kusto.persistOutputs')) {
                const userAction = await vscode.window.showInformationMessage(
                    'A setting has changed that requires a window reload to take effect.',
                    'Reload Window'
                );

                if (userAction === 'Reload Window') {
                    await vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            }
        })
    );
}
