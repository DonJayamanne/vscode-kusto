// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-var, @typescript-eslint/no-explicit-any
// var console: any = {};
import { ExtensionContext } from 'vscode';
import { initialize as initializeConstants } from './constants';
import { initialize as initializeLanguageService } from './languageServer';
import { ContentProvider } from './content/provider';
import { KernelProvider } from './kernel/provider';
import { KustoClient } from './kusto/webClient';
import { AzureAuthenticatedConnection } from './kusto/connections/azAuth';
import { registerConnection } from './kusto/connections/baseConnection';
import { AppInsightsConnection } from './kusto/connections/appInsights';
import { ClusterTreeView } from './activityBar/clusterView';
import { initializeConnectionStorage } from './kusto/connections/storage';
import { registerNotebookConnection } from './kusto/connections/notebookConnection';
import { registerExportCommand } from './content/export';
import { BrowserLanguageCapabilityProvider } from './languageServer/browser';
import { initializeGlobalCache } from './cache';
import { registerConfigurationListener } from './configuration';
import { KqlContentProvider } from './content/kqlProvider';
import { CellCodeLensProvider } from './interactive/cells';
import { registerDisposableRegistry } from './utils';
import { registerKqlNotebookConnectionHandler } from './content/kqlConnection';
import { regsisterQuickFixAction } from './content/quickFix';
export async function activate(context: ExtensionContext) {
    registerDisposableRegistry(context);
    initializeGlobalCache(context.globalState, context.workspaceState);
    initializeConstants(false); // In browser context dont use proposed API, try to always use stable stuff...
    initializeLanguageService(context);
    initializeConnectionStorage(context);
    regsisterQuickFixAction();
    registerConnection('azAuth', AzureAuthenticatedConnection, (info) =>
        'cluster' in info ? AzureAuthenticatedConnection.connectionInfofrom(info) : undefined
    );
    registerConnection('appInsights', AppInsightsConnection, (info) =>
        'cluster' in info ? undefined : AppInsightsConnection.connectionInfofrom(info)
    );
    AzureAuthenticatedConnection.registerKustoClient(KustoClient);
    AppInsightsConnection.registerKustoClient(KustoClient);
    KernelProvider.register();
    ContentProvider.register();
    KqlContentProvider.register();
    ClusterTreeView.register();
    registerKqlNotebookConnectionHandler();
    registerNotebookConnection();
    registerConfigurationListener();
    // monitorJupyterCells();
    registerExportCommand();
    BrowserLanguageCapabilityProvider.register();
    CellCodeLensProvider.register();
}
