import { Memento } from 'vscode';

let globalMemento: Memento | undefined;
let workspaceMemento: Memento | undefined;

export function initializeGlobalCache(globalState: Memento, workspaceState: Memento) {
    globalMemento = globalState;
    workspaceMemento = workspaceState;
}

export async function updateGlobalCache<T>(key: string, value: T) {
    await globalMemento?.update(key, value);
}

export function getFromGlobalCache<T>(key: string, defaultValue?: T): T | undefined {
    return globalMemento?.get(key) || defaultValue;
}

export async function updateWorkspaceCache<T>(key: string, value: T) {
    await workspaceMemento?.update(key, value);
}

export function getFromWorkspaceCache<T>(key: string, defaultValue?: T): T | undefined {
    return workspaceMemento?.get(key) || defaultValue;
}
