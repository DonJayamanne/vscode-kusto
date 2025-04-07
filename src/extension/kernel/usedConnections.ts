import { decodeConnectionInfo, encodeConnectionInfo, IConnectionInfo } from '../kusto/connections/types';
import { getFromWorkspaceCache, updateWorkspaceCache } from '../cache';
import { onConnectionChanged } from '../kusto/connections/storage';

const stateKey = 'kusto.lastUsedConnections.v3';
export function getLastUsedControllerConnections(): IConnectionInfo[] {
    const lastUsedConnections = getFromWorkspaceCache<string[]>(stateKey);
    if (!lastUsedConnections) {
        return [];
    }
    return Array.from(new Set(lastUsedConnections)).map((connection) => decodeConnectionInfo(connection));
}

export async function updateLastUsedControllerConnections(connection: IConnectionInfo) {
    const lastUsedConnections = getLastUsedControllerConnections();
    lastUsedConnections.push(connection);
    const encodedConnections = Array.from(
        new Set(lastUsedConnections.map((connection) => encodeConnectionInfo(connection)))
    );
    await updateWorkspaceCache(stateKey, encodedConnections);
}

async function removeFromLastUsedControllerConnections(connection: IConnectionInfo) {
    const lastUsedConnections = getLastUsedControllerConnections();
    const encodedConnections = Array.from(new Set(lastUsedConnections.filter((c) => c.id !== connection.id))).map(
        (connection) => encodeConnectionInfo(connection)
    );
    await updateWorkspaceCache(stateKey, encodedConnections);
}

onConnectionChanged(({ connection, change }) => {
    if (change === 'removed') {
        removeFromLastUsedControllerConnections(connection);
    }
});
