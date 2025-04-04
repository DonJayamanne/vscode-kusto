import { decodeConnectionInfo, encodeConnectionInfo, IConnectionInfo } from '../kusto/connections/types';
import { getFromWorkspaceCache, updateWorkspaceCache } from '../cache';

const stateKey = 'kusto.lastUsedConnections.v2';
export function getLastUsedConnections(): IConnectionInfo[] {
    const lastUsedConnections = getFromWorkspaceCache<string[]>(stateKey);
    if (!lastUsedConnections) {
        return [];
    }
    return Array.from(new Set(lastUsedConnections)).map((connection) => decodeConnectionInfo(connection));
}

export async function updateLastUsedConnections(connection: IConnectionInfo) {
    const lastUsedConnections = getLastUsedConnections();
    lastUsedConnections.push(connection);
    const encodedConnections = Array.from(
        new Set(lastUsedConnections.map((connection) => encodeConnectionInfo(connection)))
    );
    await updateWorkspaceCache(stateKey, encodedConnections);
}
