import type { ClientRequestProperties, KustoConnectionStringBuilder } from 'azure-kusto-data';
import type { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import { EngineSchema } from '../schema';

export type AzureAuthenticatedConnectionInfo = {
    readonly id: string;
    readonly displayName: string;
    readonly type: 'azAuth';
    readonly cluster: string;
    readonly database?: string;
};
export type AppInsightsConnectionInfo = {
    readonly id: string;
    readonly displayName: string;
    readonly type: 'appInsights';
};

export type AppInsightsConnectionSecrets = {
    appId: string;
    appKey: string;
};
export type ConnectionType = 'appInsights' | 'azAuth';
export type IConnectionInfo = AzureAuthenticatedConnectionInfo | AppInsightsConnectionInfo;

export function encodeConnectionInfo(info: IConnectionInfo): string {
    return Buffer.from(JSON.stringify(info, Object.keys(info).sort())).toString('base64');
}

export function decodeConnectionInfo(info: string): IConnectionInfo {
    const decoded = JSON.parse(Buffer.from(info, 'base64').toString('utf8'));
    // Ensure the properties are sorted.
    const encoded = encodeConnectionInfo(decoded);
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
}

export function getDisplayInfo(info: IConnectionInfo): { label: string; description: string } {
    if (info.type === 'appInsights') {
        return {
            label: `Kusto ${info.displayName || info.id}`,
            description: ``
        };
    }
    const database = info.database ? `(${info.database})` : '';
    return {
        label: `Kusto ${info.displayName || info.id} ${database}`,
        description: info.cluster
    };
}
export interface IConnection<T extends IConnectionInfo> {
    readonly info: T;
    getSchema(options?: { ignoreCache?: boolean; hideProgress?: boolean }): Promise<EngineSchema>;
    delete(): Promise<void>;
    save(): Promise<void>;
    getKustoClient(): Promise<IKustoClient>;
}

export interface NewableKustoClient {
    new (connectionStringBuilder: string | KustoConnectionStringBuilder): IKustoClient;
}
export interface IKustoClient {
    headers?: {
        [name: string]: string;
    };
    endpoints: {
        [name: string]: string;
    };
    executeQueryV1(db: string, query: string, properties?: ClientRequestProperties): Promise<KustoResponseDataSet>;
    execute(db: string, query: string, properties?: ClientRequestProperties): Promise<KustoResponseDataSet>;
}
