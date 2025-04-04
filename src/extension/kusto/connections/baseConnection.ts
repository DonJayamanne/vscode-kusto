import { ProgressLocation, window } from 'vscode';
import { getFromGlobalCache, updateGlobalCache } from '../../cache';
import { GlobalMementoKeys } from '../../constants';
import { KustoNotebookConnectionMetadata } from '../../content/provider';
import { EngineSchema } from '../schema';
import { IConnection, IConnectionInfo, IKustoClient } from './types';

const connectionProviders = new Map<
    string,
    {
        connectionCtor: NewableConnection;
        resolver: (metadata: KustoNotebookConnectionMetadata) => IConnectionInfo | undefined;
    }
>();

interface NewableConnection {
    new (info: any): IConnection<IConnectionInfo>;
}
export function registerConnection<T extends IConnectionInfo>(
    connection: string,
    connectionCtor: NewableConnection,
    resolver: (metadata: KustoNotebookConnectionMetadata) => T | undefined
) {
    connectionProviders.set(connection, {
        connectionCtor,
        resolver
    });
}
export function fromMetadata(metadata: KustoNotebookConnectionMetadata): IConnectionInfo | undefined {
    for (const provider of Array.from(connectionProviders.values())) {
        const item = provider.resolver(metadata);
        if (item) {
            return item;
        }
    }
}

export function fromConnectionInfo<T extends IConnectionInfo>(info: IConnectionInfo): IConnection<T> {
    const provider = connectionProviders.get(info.type);
    if (!provider) {
        throw new Error(`Provider '${info.type}' not supported`);
    }
    return new provider.connectionCtor(info) as IConnection<T>;
}

export abstract class BaseConnection<T extends IConnectionInfo> implements IConnection<T> {
    private schema?: Promise<EngineSchema>;
    private get schemaCacheId() {
        return `${GlobalMementoKeys.prefixForClusterSchema}:${this.info.id.toLowerCase()}`;
    }
    constructor(public readonly name: string, public readonly info: T) {}
    public async getSchema(options?: { ignoreCache?: boolean; hideProgress?: boolean }): Promise<EngineSchema> {
        const ignoreCache = options?.ignoreCache;
        const key = `${GlobalMementoKeys.prefixForClusterSchema}:${this.info.id.toLowerCase()}`;
        if (this.schema && !ignoreCache) {
            return this.schema;
        }

        const cache = getFromGlobalCache<EngineSchema>(key);
        if (cache && !ignoreCache) {
            return JSON.parse(JSON.stringify(cache));
        }

        if (options?.hideProgress) {
            try {
                const schema = await this.getSchemaInternal();
                await updateGlobalCache(this.schemaCacheId, schema);
                return schema;
            } finally {
                this.schema = undefined;
            }
        }
        this.schema = new Promise<EngineSchema>((resolve, reject) =>
            window
                .withProgress(
                    { location: ProgressLocation.Notification, title: 'Fetching Kusto Cluster Schema' },
                    async (_progress, _token) => {
                        try {
                            const schema = await this.getSchemaInternal();
                            await updateGlobalCache(this.schemaCacheId, schema);
                            return schema;
                        } finally {
                            this.schema = undefined;
                        }
                    }
                )
                .then(resolve, reject)
        );
        return this.schema;
    }
    abstract getSchemaInternal(): Promise<EngineSchema>;
    abstract delete(): Promise<void>;
    abstract save(): Promise<void>;
    abstract getKustoClient(): Promise<IKustoClient>;
}
