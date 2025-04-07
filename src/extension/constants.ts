import { commands } from 'vscode';

// eslint-disable-next-line @typescript-eslint/no-empty-function
export const noop = () => {};

export enum GlobalMementoKeys {
    clusterUris = 'clusterUris.14',
    lastUsedConnection = 'lastUsedConnection.14',
    lastEnteredClusterUri = 'lastEnteredClusterUri.14',
    lastEnteredDatabase = 'lastEnteredDatabase.14',
    prefixForClusterSchema = 'prefixForClusterSchema.14',
    prefixForDatabasesInACluster = 'prefixForDatabasesInACluster.14',
    prefixForTablesInAClusterDB = 'prefixForTablesInAClusterDB.14'
}

let _useProposedApi = false;
export const useProposedApi = () => _useProposedApi;
export function initialize(useProposedApi: boolean) {
    _useProposedApi = useProposedApi;
    commands.executeCommand('setContext', 'kusto.useProposedApi', useProposedApi);
}
