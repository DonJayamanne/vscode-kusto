import { commands } from 'vscode';

// eslint-disable-next-line @typescript-eslint/no-empty-function
export const noop = () => {};

export enum GlobalMementoKeys {
    clusterUris = 'clusterUris.12',
    lastUsedConnection = 'lastUsedConnection.12',
    lastEnteredClusterUri = 'lastEnteredClusterUri.12',
    lastEnteredDatabase = 'lastEnteredDatabase.12',
    prefixForClusterSchema = 'prefixForClusterSchema.12',
    prefixForDatabasesInACluster = 'prefixForDatabasesInACluster.12',
    prefixForTablesInAClusterDB = 'prefixForTablesInAClusterDB.12'
}

let _useProposedApi = false;
export const useProposedApi = () => _useProposedApi;
export function initialize(useProposedApi: boolean) {
    _useProposedApi = useProposedApi;
    commands.executeCommand('setContext', 'kusto.useProposedApi', useProposedApi);
}
