import { Event, EventEmitter, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { fromConnectionInfo } from '../kusto/connections';
import { getCachedConnections } from '../kusto/connections/storage';
import { IConnectionInfo } from '../kusto/connections/types';
import {
    Function as KustoFunction,
    Column,
    Database,
    EngineSchema,
    Table,
    InputParameter,
    TableEntityType
} from '../kusto/schema';
import { DeepReadonly, IDisposable } from '../types';
import { AzureAuthenticatedConnection } from '../kusto/connections/azAuth';

export type NodeType =
    | 'cluster'
    | 'database'
    | 'table'
    | 'tables'
    | 'column'
    | 'functions'
    | 'function'
    | 'inputParameter';
export interface ITreeData {
    readonly parent?: ITreeData;
    readonly type: NodeType;
    getTreeItem(): Promise<TreeItem>;
    getChildren?(): Promise<ITreeData[] | undefined>;
}
export class ClusterNode implements ITreeData {
    public readonly type: NodeType = 'cluster';
    public get schema(): DeepReadonly<EngineSchema> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.engineSchema!;
    }
    constructor(public readonly info: IConnectionInfo, private engineSchema?: EngineSchema) {}

    public async getTreeItem(): Promise<TreeItem> {
        const item = new TreeItem(this.info.displayName, TreeItemCollapsibleState.Expanded);
        item.iconPath = new ThemeIcon('server-environment');
        try {
            const connection = fromConnectionInfo(this.info);
            if (connection instanceof AzureAuthenticatedConnection) {
                item.tooltip = connection.info.cluster;
            }
        } catch {
            //
        }
        item.contextValue = this.type;
        if (!this.engineSchema) {
            item.iconPath = new ThemeIcon('error');
            item.tooltip = 'Failed to fetch the schema for this cluster, please check the logs.';
        }
        return item;
    }
    public async getChildren(): Promise<ITreeData[]> {
        if (!this.engineSchema) {
            return [];
        }
        return this.engineSchema.cluster.databases
            .map((item) => new DatabaseNode(this, item.name))
            .sort((a, b) => a.database.name.localeCompare(b.database.name));
    }
    public async updateSchema(schema?: EngineSchema) {
        this.engineSchema = schema;
    }
}
export class DatabaseNode implements ITreeData {
    public readonly type: NodeType = 'database';
    public get database(): DeepReadonly<Database> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.parent.schema.cluster.databases.find(
            (item) => item.name.toLowerCase() === this.databaseName.toLowerCase()
        )!;
    }
    constructor(public readonly parent: ClusterNode, private readonly databaseName: string) {}
    public async getTreeItem(): Promise<TreeItem> {
        const item = new TreeItem(this.database.name, TreeItemCollapsibleState.Collapsed);
        item.contextValue = this.type;
        item.iconPath = new ThemeIcon('database');
        return item;
    }
    public async getChildren(): Promise<ITreeData[]> {
        const tables = this.database.tables
            .filter((table) => !table.entityType || table.entityType === 'Table')
            .map((table) => new TableNode(this, table.name))
            .sort((a, b) => a.table.name.localeCompare(b.table.name));
        const materializedViews = this.database.tables.some(
            (table) => !table.entityType || table.entityType === 'MaterializedViewTable'
        )
            ? [new TablesNode(this, 'Materialized Views', 'MaterializedViewTable')]
            : [];
        const externalTables = this.database.tables.some(
            (table) => !table.entityType || table.entityType === 'ExternalTable'
        )
            ? [new TablesNode(this, 'External Tables', 'ExternalTable')]
            : [];
        const functions = this.database.functions.length > 0 ? [new FunctionsNode(this)] : [];
        const nodes = [...functions, ...externalTables, ...materializedViews];
        if (nodes.length === 0) {
            return tables;
        } else {
            return nodes.concat([new TablesNode(this, 'Tables', 'Table')]);
        }
    }
}
export class TablesNode implements ITreeData {
    public readonly type: NodeType = 'tables';
    public get tables(): DeepReadonly<Table[]> {
        return this.parent.database.tables.filter((item) => (item.entityType || 'Table') === this.entityType);
    }
    constructor(
        public readonly parent: DatabaseNode,
        private readonly label: string = 'Table',
        private readonly entityType: TableEntityType
    ) {}
    public async getTreeItem(): Promise<TreeItem> {
        const item = new TreeItem(this.label, TreeItemCollapsibleState.Collapsed);
        item.contextValue = this.type;
        item.iconPath = new ThemeIcon('library');
        return item;
    }
    public async getChildren() {
        const folders = Array.from(
            new Set<string>(this.tables.map((item) => item.folder || '').filter((item) => !!item))
        ).sort();
        const folderNodes = folders.map((folder) => new TablesFolderNode(this.parent, folder, this.entityType));
        const tableNodes = this.tables
            .filter((item) => !item.folder)
            .map((item) => new TableNode(this.parent, item.name))
            .sort((a, b) => a.table.name.localeCompare(b.table.name));
        return [...folderNodes, ...tableNodes];
    }
}
export class TablesFolderNode implements ITreeData {
    public readonly type: NodeType = 'tables';
    public get tables(): DeepReadonly<Table[]> {
        return this.parent.database.tables.filter(
            (item) => (item.entityType || 'Table') === this.entityType && (item.folder || '') === this.folder
        );
    }
    constructor(
        public readonly parent: DatabaseNode,
        private readonly folder: string,
        private readonly entityType: TableEntityType = 'Table'
    ) {}
    public async getTreeItem(): Promise<TreeItem> {
        const item = new TreeItem(this.folder, TreeItemCollapsibleState.Collapsed);
        item.contextValue = this.type;
        item.iconPath = new ThemeIcon('folder');
        return item;
    }
    public async getChildren() {
        return this.tables
            .map((item) => new TableNode(this.parent, item.name))
            .sort((a, b) => a.table.name.localeCompare(b.table.name));
    }
}
export class TableNode implements ITreeData {
    public readonly type: NodeType = 'table';
    public get entityType(): string | undefined {
        return this.table.entityType;
    }
    public get table(): DeepReadonly<Table> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.parent.database.tables.find((item) => item.name.toLowerCase() === this.tableName.toLowerCase())!;
    }
    constructor(public readonly parent: DatabaseNode, private readonly tableName: string) {}
    public async getTreeItem(): Promise<TreeItem> {
        const table = this.table;
        const item = new TreeItem(this.tableName, TreeItemCollapsibleState.Collapsed);
        item.contextValue = this.type;
        const struct = `\n${table.name}: (${table.columns.map((c) => c.name).join(', ')})`;
        item.tooltip = [table.docstring, struct]
            .filter((item) => !!item)
            .join('\n')
            .trim();
        item.description =
            table.entityType && table.entityType.toLowerCase() !== 'table' ? `(${table.entityType})` : '';
        item.iconPath = new ThemeIcon('table');
        return item;
    }
    public async getChildren() {
        return this.table.columns.map((col) => new ColumnNode(this, col.name));
    }
}
export class ColumnNode implements ITreeData {
    public readonly type: NodeType = 'column';
    public get column(): DeepReadonly<Column> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.parent.table.columns.find((col) => col.name.toLowerCase() === this.columnName.toLowerCase())!;
    }
    constructor(public readonly parent: TableNode, private readonly columnName: string) {}
    public async getTreeItem(): Promise<TreeItem> {
        const col = this.column;
        const item = new TreeItem(this.columnName, TreeItemCollapsibleState.None);
        item.contextValue = this.type;
        item.description = `(${col.type})`;
        item.tooltip = col.docstring;
        item.iconPath = getCslTypeIcon(col.type || '');
        return item;
    }
}
export class FunctionsNode implements ITreeData {
    public readonly type: NodeType = 'functions';
    public get functions(): DeepReadonly<KustoFunction[]> {
        return this.parent.database.functions;
    }
    constructor(public readonly parent: DatabaseNode) {}
    public async getTreeItem(): Promise<TreeItem> {
        const item = new TreeItem('Functions', TreeItemCollapsibleState.Collapsed);
        item.contextValue = this.type;
        item.iconPath = new ThemeIcon('symbol-method-arrow');
        return item;
    }
    public async getChildren() {
        const folders = Array.from(
            new Set<string>(this.functions.map((item) => item.folder || '').filter((item) => !!item))
        ).sort();
        const folderNodes = folders.map((folder) => new FunctionsFolderNode(this.parent, folder));
        const functionNodes = this.functions
            .filter((item) => !item.folder)
            .map((item) => new FunctionNode(this.parent, item.name))
            .sort((a, b) => a.function.name.localeCompare(b.function.name));
        return [...folderNodes, ...functionNodes];
    }
}
export class FunctionsFolderNode implements ITreeData {
    public readonly type: NodeType = 'functions';
    public get functions(): DeepReadonly<KustoFunction[]> {
        return this.parent.database.functions.filter((item) => (item.folder || '') === this.folder);
    }
    constructor(public readonly parent: DatabaseNode, private readonly folder: string) {}
    public async getTreeItem(): Promise<TreeItem> {
        const item = new TreeItem(this.folder, TreeItemCollapsibleState.Collapsed);
        item.contextValue = this.type;
        item.iconPath = new ThemeIcon('folder');
        return item;
    }
    public async getChildren() {
        return this.functions
            .map((arg) => new FunctionNode(this.parent, arg.name))
            .sort((a, b) => a.function.name.localeCompare(b.function.name));
    }
}

export class FunctionNode implements ITreeData {
    public readonly type: NodeType = 'function';
    public get function(): DeepReadonly<KustoFunction> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.parent.database.functions.find(
            (item) => item.name.toLowerCase() === this.functionName.toLowerCase()
        )!;
    }
    constructor(public readonly parent: DatabaseNode, private readonly functionName: string) {}
    public async getTreeItem(): Promise<TreeItem> {
        const item = new TreeItem(this.functionName, TreeItemCollapsibleState.Collapsed);
        item.contextValue = this.type;
        const args = this.function.inputParameters.length
            ? `(${this.function.inputParameters.map((param) => param.name).join(', ')})`
            : '';
        item.description = args;
        const struct = `\n${this.function.name}${args}`;
        item.tooltip = [this.function.docstring, struct]
            .filter((item) => !!item)
            .join('\n')
            .trim();
        item.iconPath = new ThemeIcon('symbol-method');
        return item;
    }
    public async getChildren() {
        return this.function.inputParameters.map((arg) => new InputParameterNode(this, arg.name));
    }
}
export class InputParameterNode implements ITreeData {
    public readonly type: NodeType = 'inputParameter';
    public get inputParameter(): DeepReadonly<InputParameter> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.parent.function.inputParameters.find(
            (param) => param.name.toLowerCase() === this.inputParameterName.toLowerCase()
        )!;
    }
    constructor(public readonly parent: FunctionNode, private readonly inputParameterName: string) {}
    public async getTreeItem(): Promise<TreeItem> {
        const param = this.inputParameter;
        const item = new TreeItem(this.inputParameterName, TreeItemCollapsibleState.None);
        item.contextValue = this.type;
        item.description = param.cslType || param.type ? `(${param.cslType || param.type})` : '';
        item.tooltip = param.docstring;
        item.iconPath = getCslTypeIcon(param.cslType || param.type || '');
        return item;
    }
}
function getCslTypeIcon(cslType: string): ThemeIcon {
    switch (cslType) {
        case 'datetime':
        case 'datetimeoffset':
        case 'timespan':
            return new ThemeIcon('history');
        case 'guid':
            return new ThemeIcon('symbol-constant');
        case 'uint8':
        case 'int16':
        case 'uint16':
        case 'int':
        case 'uint':
        case 'float':
        case 'decimal':
        case 'long':
        case 'ulong':
        case 'real':
            return new ThemeIcon('symbol-numeric');
        case 'bool':
        case 'boolean':
            return new ThemeIcon('symbol-boolean');
        case 'string':
            return new ThemeIcon('symbol-string');
        default:
            return new ThemeIcon('symbol-parameter');
    }
}
export class KustoClusterExplorer implements TreeDataProvider<ITreeData>, IDisposable {
    private readonly _onDidChangeTreeData = new EventEmitter<ITreeData | void>();
    private readonly connections: ClusterNode[] = [];

    public get onDidChangeTreeData(): Event<ITreeData | void> {
        return this._onDidChangeTreeData.event;
    }
    public dispose() {
        this._onDidChangeTreeData.dispose();
    }
    public async getTreeItem(element: ITreeData): Promise<TreeItem> {
        return element.getTreeItem();
    }
    public async getChildren(element?: ITreeData): Promise<ITreeData[] | undefined> {
        if (!element) {
            return this.connections;
        }
        return element.getChildren ? element.getChildren() : undefined;
    }
    public getParent?(element: ITreeData): ITreeData | undefined {
        return element?.parent;
    }
    public async removeCluster(connection: IConnectionInfo) {
        const indexToRemove = this.connections.findIndex((item) => item.info.id === connection.id);
        if (indexToRemove === -1) {
            return;
        }
        this.connections.splice(indexToRemove, 1);
        this._onDidChangeTreeData.fire();
    }
    public async addConnection(connection: IConnectionInfo) {
        if (this.connections.find((cluster) => cluster.info.id === connection.id)) {
            return;
        }
        try {
            const schema = await fromConnectionInfo(connection).getSchema();
            this.connections.push(new ClusterNode(connection, schema));
            this._onDidChangeTreeData.fire();
        } catch (ex) {
            // If it fails, add the cluster so user can remove it & they know something is wrong.
            this.connections.push(new ClusterNode(connection));
            this._onDidChangeTreeData.fire();
            throw ex;
        }
    }
    public async refresh() {
        const connections = getCachedConnections();
        if (!Array.isArray(connections)) {
            return;
        }
        if (this.connections.length === 0) {
            await Promise.all(
                connections.map((clusterUri) =>
                    this.addConnection(clusterUri).catch((ex) =>
                        console.error(`Failed to add cluster ${clusterUri}`, ex)
                    )
                )
            );
        } else {
            await Promise.all(
                connections.map((item) =>
                    this.refreshConnection(item).catch((ex) =>
                        console.error(`Failed to add cluster ${JSON.stringify(item)}`, ex)
                    )
                )
            );
        }
    }

    public async refreshConnection(connection: IConnectionInfo) {
        const connectionNode = this.connections.find((item) => item.info.id === connection.id);
        if (connectionNode) {
            try {
                const schema = await fromConnectionInfo(connection).getSchema({ ignoreCache: true });
                connectionNode.updateSchema(schema);
                this._onDidChangeTreeData.fire(connectionNode);
            } catch (ex) {
                // If it fails, update node so user knows something is wrong.
                connectionNode.updateSchema();
                this._onDidChangeTreeData.fire(connectionNode);
            }
        }
    }
}
