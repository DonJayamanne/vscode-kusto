import { IDisposable } from './types';
import { CancellationToken, ExtensionContext, NotebookDocument, TextDocument, Uri, workspace } from 'vscode';
import { createHash } from 'crypto';

const disposables: IDisposable[] = [];
export function registerDisposableRegistry(context: ExtensionContext) {
    context.subscriptions.push({
        dispose: () => disposeAllDisposables(disposables)
    });
}

export function disposeAllDisposables(disposables: IDisposable[]) {
    while (disposables.length) {
        const item = disposables.shift();
        if (item) {
            try {
                item.dispose();
            } catch {
                // Noop.
            }
        }
    }
}

export function registerDisposable(disposable: IDisposable) {
    disposables.push(disposable);
}

//======================
// Deferred

// eslint-disable-next-line @typescript-eslint/naming-convention
export interface Deferred<T> {
    readonly promise: Promise<T>;
    readonly resolved: boolean;
    readonly rejected: boolean;
    readonly completed: boolean;
    resolve(value?: T | PromiseLike<T>): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reject(reason?: any): void;
}

class DeferredImpl<T> implements Deferred<T> {
    private _resolve!: (value: T | PromiseLike<T>) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private _reject!: (reason?: any) => void;
    private _resolved = false;
    private _rejected = false;
    private _promise: Promise<T>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(private scope: any = null) {
        // eslint-disable-next-line
        this._promise = new Promise<T>((res, rej) => {
            this._resolve = res;
            this._reject = rej;
        });
    }
    public resolve(_value?: T | PromiseLike<T>) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-rest-params
        this._resolve.apply(this.scope ? this.scope : this, arguments as any);
        this._resolved = true;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public reject(_reason?: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-rest-params
        this._reject.apply(this.scope ? this.scope : this, arguments as any);
        this._rejected = true;
    }
    get promise(): Promise<T> {
        return this._promise;
    }
    get resolved(): boolean {
        return this._resolved;
    }
    get rejected(): boolean {
        return this._rejected;
    }
    get completed(): boolean {
        return this._rejected || this._resolved;
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDeferred<T>(scope: any = null): Deferred<T> {
    return new DeferredImpl<T>(scope);
}

export function createDeferredFrom<T>(...promises: Promise<T>[]): Deferred<T> {
    const deferred = createDeferred<T>();
    Promise.all<T>(promises)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(deferred.resolve.bind(deferred) as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .catch(deferred.reject.bind(deferred) as any);

    return deferred;
}
export function createDeferredFromPromise<T>(promise: Promise<T>): Deferred<T> {
    const deferred = createDeferred<T>();
    promise.then(deferred.resolve.bind(deferred)).catch(deferred.reject.bind(deferred));
    return deferred;
}

export function createPromiseFromToken<T>(
    token: CancellationToken,
    options: { action: 'reject' } | { action: 'resolve'; value: T }
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const disposable = token.onCancellationRequested(() => {
            if (options.action === 'reject') {
                return reject();
            } else {
                return resolve(options.value);
            }
            disposable.dispose();
        });

        registerDisposable(disposable);
    });
}
export const NotebookCellScheme = 'vscode-notebook-cell';
export const InteractiveScheme = 'vscode-interactive';
export const InteractiveInputScheme = 'vscode-interactive-input';
export function isUntitledFile(file?: Uri) {
    return file?.scheme === 'untitled';
}
export function isKustoFile(document: TextDocument) {
    return document.languageId.toLowerCase() === 'kusto';
}
export function isKustoCell(document: TextDocument) {
    return document.languageId.toLowerCase() === 'kusto' && document.uri.scheme === NotebookCellScheme;
}
export function isNotebookCell(document: NotebookDocument | TextDocument) {
    return document.uri.scheme === NotebookCellScheme;
}
export function getHash(value: string) {
    return createHash('sha1').update(value).digest('hex');
}

export function getNotebookDocument(document: TextDocument | NotebookDocument): NotebookDocument | undefined {
    return workspace.notebookDocuments.find((item) => item.uri.path === document.uri.path);
}

export const InteractiveWindowView = 'interactive';
export const InteractiveWindowScheme = 'vscode-interactive';
export function isInteractiveWindow(document: NotebookDocument) {
    return document.notebookType === InteractiveWindowView;
}

export function isJupyterNotebook(document?: NotebookDocument) {
    return document?.notebookType === 'jupyter-notebook';
}
export function getJupyterNotebook(textDocument: TextDocument) {
    return workspace.notebookDocuments.find(
        (nb) => isJupyterNotebook(nb) && nb.getCells().some((c) => c.document === textDocument)
    );
}
export function isKustoNotebook(document: NotebookDocument) {
    return document.notebookType === 'kusto-notebook' || document.notebookType === 'kusto-notebook-kql';
}
export function getKustoNotebook(textDocument: TextDocument) {
    return workspace.notebookDocuments.find(
        (nb) => isKustoNotebook(nb) && nb.getCells().some((c) => c.document === textDocument)
    );
}

export function isNotebookDocument(document: NotebookDocument | TextDocument): document is NotebookDocument {
    return 'notebookType' in document;
}
