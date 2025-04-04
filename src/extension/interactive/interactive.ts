import {
    NotebookCellData,
    NotebookCellKind,
    NotebookDocument,
    NotebookEdit,
    NotebookEditor,
    NotebookRange,
    Range,
    TextDocument,
    Uri,
    ViewColumn,
    window,
    workspace,
    WorkspaceEdit
} from 'vscode';
import { commands } from 'vscode';
import { InteractiveWindowView, registerDisposable } from '../utils';
import { KernelPerConnection, registerController } from '../kernel/provider';
import { FoldingRangesProvider } from '../languageServer';
import { ensureDocumentHasConnectionInfo } from '../kusto/connections/notebookConnection';

export function registerInteractiveExperience() {
    registerDisposable(commands.registerCommand('kusto.executeSelectedQuery', executeSelectedQuery));
}

type INativeInteractiveWindow = { notebookUri: Uri; inputUri: Uri; notebookEditor: NotebookEditor };
const documentInteractiveDocuments = new WeakMap<
    TextDocument,
    Promise<readonly [NotebookDocument, KernelPerConnection] | undefined>
>();

async function executeSelectedQuery(document: TextDocument, start: number, end: number) {
    if (!document) {
        if (
            !window.activeTextEditor ||
            !window.activeTextEditor.selection ||
            window.activeTextEditor.selections.length > 1 ||
            window.activeTextEditor.document.languageId.toLowerCase() !== 'kusto'
        ) {
            return;
        }
        const selection = window.activeTextEditor.selection;
        document = window.activeTextEditor.document;
        const ranges = await FoldingRangesProvider.instance.getRanges(document);
        const range = ranges.find((r) => r.start <= selection.start.line && r.end >= selection.end.line);
        if (!range) {
            return;
        }

        start = range.start;
        for (start = range.start; start <= range.end; start++) {
            const line = document.lineAt(start).text;
            if (line.trim().startsWith('//')) {
                continue;
            } else {
                break;
            }
        }
        end = range.end;
    }
    if (!documentInteractiveDocuments.has(document)) {
        documentInteractiveDocuments.set(document, getNotebookDocument(document));
    }
    let info = await documentInteractiveDocuments.get(document);
    if (!info || info[0].isClosed) {
        documentInteractiveDocuments.set(document, getNotebookDocument(document));
    }
    info = await documentInteractiveDocuments.get(document);
    if (!info) {
        return;
    }
    const [notebook, controller] = info;
    // Ensure its visible.
    await commands.executeCommand('interactive.open', undefined, notebook.uri, undefined);
    const cell = await createCell(notebook, document, start, end);
    controller.executeInteractive([cell], document);
}

async function pickConnection(document: TextDocument) {
    const info = await ensureDocumentHasConnectionInfo(document);
    if (!info) {
        return;
    }
    return registerController(InteractiveWindowView, info);
}

async function getNotebookDocument(document: TextDocument) {
    const controller = await pickConnection(document);
    if (!controller) {
        return;
    }
    const info = (await commands.executeCommand(
        'interactive.open',
        { viewColumn: ViewColumn.Beside, preserveFocus: true },
        undefined,
        `donjayamanne.kusto/${controller.notebookController.id}`,
        'Kusto Interactive Window'
    )) as INativeInteractiveWindow;
    return [info.notebookEditor.notebook, controller] as const;
}
async function createCell(notebook: NotebookDocument, document: TextDocument, start: number, end: number) {
    const text = document.getText(new Range(document.lineAt(start).range.start, document.lineAt(end).range.end));
    const edit = new WorkspaceEdit();
    const cell = new NotebookCellData(NotebookCellKind.Code, text.trim(), 'kusto');
    cell.metadata = {
        interactiveWindowCellMarker: document.lineAt(start).text,
        interactive: {
            file: document.uri.fsPath,
            line: start
        }
    };
    const nbEdit = NotebookEdit.replaceCells(new NotebookRange(notebook.cellCount, notebook.cellCount), [cell]);
    edit.set(notebook.uri, [nbEdit]);
    await workspace.applyEdit(edit);
    return notebook.cellAt(notebook.cellCount - 1);
}
