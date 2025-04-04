import type { AzureAuthenticatedConnectionInfo, IKustoClient } from '../types';
import type { Database, EngineSchema, Function, InputParameter, Table, TableEntityType } from '../../schema';
import { GlobalMementoKeys } from '../../../constants';
import { getFromGlobalCache, updateGlobalCache } from '../../../cache';
import { fromConnectionInfo } from '..';

export async function getClusterSchema(connection: AzureAuthenticatedConnectionInfo): Promise<EngineSchema> {
    const client = await fromConnectionInfo(connection).getKustoClient();
    const cluster = connection.cluster;
    const databaseNames = await getDatabases(client, cluster, true);
    const databases = await Promise.all(
        databaseNames.map((database) => getDatabaseSchema(client, { ...connection, database: database }, true))
    );
    const engineSchema: EngineSchema = {
        cluster: {
            connectionString: cluster,
            databases
        },
        clusterType: 'Engine',
        database: undefined
    };
    return engineSchema;
}

const databasePromises = new Map<string, Promise<string[]>>();
async function getDatabases(client: IKustoClient, clusterUri: string, ignoreCache?: boolean): Promise<string[]> {
    const key = `${GlobalMementoKeys.prefixForDatabasesInACluster}:${clusterUri.toLowerCase()}`;
    let promise = databasePromises.get(key);
    if (promise && !ignoreCache) {
        return promise;
    }
    const cache = getFromGlobalCache<string[]>(key);
    if (Array.isArray(cache) && !ignoreCache) {
        return JSON.parse(JSON.stringify(cache));
    }

    const fn = async () => {
        try {
            const result = await client.execute('', '.show databases');
            if (result.primaryResults.length === 0) {
                throw new Error(`Failed to query databases for cluster ${clusterUri}`);
            }
            const dbNameColumn = result.primaryResults[0].columns.find(
                (item) => item.name?.toLowerCase() === 'databasename'
            );
            if (!dbNameColumn) {
                throw new Error(
                    `Failed to find column 'DatabaseName' when querying databases for cluster ${clusterUri}`
                );
            }
            const dbNames: string[] = result.primaryResults[0]._rows.map((item) => item[dbNameColumn.ordinal]);
            await updateGlobalCache(key, dbNames);
            return dbNames;
        } finally {
            databasePromises.delete(key);
        }
    };
    promise = fn();
    databasePromises.set(key, promise);
    return promise;
}
type TableSchema = {
    Name: string;
    Folder: string;
    DocString: string;
    OrderedColumns: {
        Name: string;
        Type: string;
        CslType: string;
    }[];
};
type ScalarInput = {
    Name: string;
    Type: string;
    CslType: string;
    CslDefaultValue?: string;
};
type FunctionInputParameter =
    | {
          Columns: {
              Name: string;
              Type: string;
              CslType: string;
          }[];
          Name: string;
      }
    | ScalarInput;
type FunctionSchema = {
    Name: string;
    InputParameters: FunctionInputParameter[];
    Body: string;
    Folder: string;
    DocString: string;
    FunctionKind: string;
    OutputColumns: [];
};
type DatabaseSchemaResponseItem = {
    Name: string;
    Tables: Record<string, TableSchema>;
    ExternalTables: Record<string, TableSchema>;
    MaterializedViews: Record<string, TableSchema>;
    MajorVersion: number;
    MinorVersion: number;
    Functions: Record<string, FunctionSchema>;
};
type DatabaseSchemaResponse = { Databases: Record<string, DatabaseSchemaResponseItem> };

const dbSchemaPromises = new Map<string, Promise<Database>>();
function translateResponseTableToSchemaTable(table: TableSchema, entityType: TableEntityType): Table {
    return {
        entityType,
        name: table.Name,
        folder: table.Folder,
        docstring: table.DocString,
        columns: table.OrderedColumns.map((col) => {
            return {
                name: col.Name,
                type: col.CslType,
                docstring: (col as any).DocString || ''
            };
        })
    };
}
function translateResponseScalarInputParamToInputParametere(item: ScalarInput): InputParameter {
    return {
        name: item.Name,
        cslDefaultValue: item.CslDefaultValue,
        cslType: item.CslType,
        type: item.Type,
        docstring: (item as any).DocString || ''
    };
}
function translateResponseInputParamToSchemaColumn(item: FunctionInputParameter): InputParameter {
    if ('Columns' in item) {
        const columns = item.Columns.map((col) => translateResponseScalarInputParamToInputParametere(col));
        return {
            name: item.Name,
            columns
        };
    }
    return translateResponseScalarInputParamToInputParametere(item);
}
// eslint-disable-next-line @typescript-eslint/ban-types
function translateResponseFunctionToSchemaFunction(fn: FunctionSchema): Function {
    return {
        name: fn.Name,
        docstring: fn.DocString,
        body: fn.Body,
        folder: fn.Folder,
        inputParameters: fn.InputParameters.map(translateResponseInputParamToSchemaColumn)
    };
}
async function getDatabaseSchema(
    client: IKustoClient,
    connection: AzureAuthenticatedConnectionInfo,
    ignoreCache?: boolean
): Promise<Database> {
    const key = `${GlobalMementoKeys.prefixForTablesInAClusterDB}:${connection.cluster.toLowerCase()}:${
        connection.database
    }`;
    let promise = dbSchemaPromises.get(key);
    if (promise && !ignoreCache) {
        return promise;
    }
    const cache = getFromGlobalCache<Database>(key);
    if (cache && !ignoreCache) {
        return JSON.parse(JSON.stringify(cache));
    }

    const fn = async () => {
        try {
            // TODO: Use management query.
            const result = await client.execute(connection.database || '', '.show database schema as json');
            if (result.primaryResults.length === 0 || result.primaryResults[0]._rows.length == 0) {
                throw new Error(
                    `Failed to query database schema for cluster ${connection.cluster}:${connection.database}`
                );
            }
            const schema: DatabaseSchemaResponse = JSON.parse(result.primaryResults[0]._rows[0]);
            const dbSchemaResponse = Object.keys(schema.Databases).map((name) => schema.Databases[name])[0];
            const tables = Object.keys(dbSchemaResponse.Tables).map((name) => dbSchemaResponse.Tables[name]);
            const externalTables = Object.keys(dbSchemaResponse.ExternalTables).map(
                (name) => dbSchemaResponse.ExternalTables[name]
            );
            const views = Object.keys(dbSchemaResponse.MaterializedViews).map(
                (name) => dbSchemaResponse.MaterializedViews[name]
            );
            const functions = Object.keys(dbSchemaResponse.Functions).map((name) => dbSchemaResponse.Functions[name]);
            const dbSchema: Database = {
                name: dbSchemaResponse.Name,
                majorVersion: dbSchemaResponse.MajorVersion,
                minorVersion: dbSchemaResponse.MinorVersion,
                tables: [
                    ...tables.map((item) => translateResponseTableToSchemaTable(item, 'Table')),
                    ...externalTables.map((item) => translateResponseTableToSchemaTable(item, 'ExternalTable')),
                    ...views.map((item) => translateResponseTableToSchemaTable(item, 'MaterializedViewTable'))
                ],
                functions: functions.map(translateResponseFunctionToSchemaFunction)
            };
            await updateGlobalCache(key, dbSchema);
            return dbSchema;
        } finally {
            dbSchemaPromises.delete(key);
        }
    };
    promise = fn();
    dbSchemaPromises.set(key, promise);
    return promise;
}
