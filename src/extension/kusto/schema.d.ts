// Definition of schema object in the context of language services. This model is exposed to consumers of this library.

export interface Column {
    name: string;
    type: string;
    docstring?: string;
}
export interface Table {
    name: string;
    folder?: string;
    entityType?: TableEntityType;
    columns: Column[];
    docstring?: string;
}
export interface ScalarParameter {
    name: string;
    type?: string;
    cslType?: string;
    docstring?: string;
    cslDefaultValue?: string;
}

// an input parameter either be a scalar in which case it has a name, type and cslType, or it can be columnar, in which case
// it will have a name, and a list of scalar types which are the column types.
export type InputParameter = ScalarParameter & { columns?: ScalarParameter[] };

export interface Function {
    name: string;
    body: string;
    folder?: string;
    inputParameters: InputParameter[];
    docstring?: string;
}
export interface Database {
    name: string;
    tables: Table[];
    functions: Function[];
    majorVersion: number;
    minorVersion: number;
}

export type ClusterType = 'Engine' | 'DataManagement' | 'ClusterManager';

export interface EngineSchema {
    clusterType: 'Engine';
    cluster: {
        connectionString: string;
        databases: Database[];
    };
    database: Database | undefined; // a reference to the database that's in current context.
    globalParameters?: ScalarParameter[];
}

export type TableEntityType = 'Table' | 'ExternalTable' | 'MaterializedViewTable';

export interface ClusterMangerSchema {
    clusterType: 'ClusterManager';
    accounts: string[];
    services: string[];
    connectionString: string;
}

export interface DataManagementSchema {
    clusterType: 'DataManagement';
}
