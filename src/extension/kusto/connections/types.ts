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
    const json = JSON.stringify(info, Object.keys(info).sort());
    return stringToBase64(json);
}

export function decodeConnectionInfo(info: string): IConnectionInfo {
    const decoded = JSON.parse(base64ToString(info));
    // Ensure the properties are sorted.
    const encoded = encodeConnectionInfo(decoded);
    return JSON.parse(base64ToString(encoded));
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

function base64ToString(base64: string): string {
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
        return Buffer.from(base64, 'base64').toString('utf8');
    } else {
        return new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
    }
}

function stringToBase64(value: string): string {
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
        return Buffer.from(value).toString('base64');
    } else {
        // https://developer.mozilla.org/en-US/docs/Glossary/Base64#solution_1_%E2%80%93_escaping_the_string_before_encoding_it
        return btoa(
            encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, function (_match, p1) {
                return String.fromCharCode(Number.parseInt('0x' + p1));
            })
        );
    }
}
