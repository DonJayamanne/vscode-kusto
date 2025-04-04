import { commands, NotebookCell, NotebookCellKind, Uri, window, workspace } from 'vscode';
import { isKustoNotebook, registerDisposable } from '../utils';
import { getConnectionInfoFromDocumentMetadata } from '../kusto/connections/notebookConnection';
import { updateGlobalCache } from '../cache';
import { ICodeCell, IMarkdownCell, INotebookContent } from './jupyter';
export function registerExportCommand() {
    registerDisposable(commands.registerCommand('kusto.exportNotebookAsScript', exportNotebook));
}

async function exportNotebook(uri?: Uri) {
    uri = uri || window.activeNotebookEditor?.notebook.uri;
    if (!uri) {
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const document = workspace.notebookDocuments.find((item) => item.uri.toString() === uri!.toString());
    if (!document) {
        return;
    }
    if (!isKustoNotebook(document)) {
        return;
    }

    const target = await window.showSaveDialog({
        filters: {
            'Kusto Script': ['csl', 'kql'],
            'Jupyter Notebook': ['ipynb']
        },
        saveLabel: 'Export',
        title: 'Export as Kusto Notebook',
        defaultUri: Uri.parse('export.csl')
    });
    if (!target) {
        return;
    }

    const connection = getConnectionInfoFromDocumentMetadata(document);
    let script: string;
    if (target.fsPath.toLowerCase().endsWith('.ipynb')) {
        const cells: (ICodeCell | IMarkdownCell)[] = [];
        cells.push({
            cell_type: 'code',
            execution_count: null,
            metadata: {},
            outputs: [],
            source: [
                '# %pip install kqlmagic # Ensure kqlmagic is installed',
                '%env KQLMAGIC_LOAD_MODE=silent',
                '%env KQLMAGIC_CONFIGURATION="show_query_time=False;show_init_banner=False;check_magic_version=False;show_what_new=False;show_conn_info=None;try_azcli_login=True"',
                '%reload_ext Kqlmagic'
            ]
        });
        switch (connection?.type) {
            case 'azAuth':
                cells.push({
                    cell_type: 'code',
                    execution_count: null,
                    metadata: {},
                    outputs: [],
                    source: [
                        `%kql azureDataExplorer://code;cluster='${connection.cluster}';database='${connection.database}'`
                    ]
                });
                break;
            case 'appInsights':
                cells.push({
                    cell_type: 'code',
                    execution_count: null,
                    metadata: {},
                    outputs: [],
                    source: [`%kql appinsights://appid='<APPID>';appkey='<APPKEY>'`]
                });
        }
        cells.push(...document.getCells().map(convertCellToJupyter));
        const jupyterNotebook: INotebookContent = {
            cells,
            metadata: {
                orig_nbformat: 4
            },
            nbformat: 4,
            nbformat_minor: 4
        };
        script = JSON.stringify(jupyterNotebook, undefined, 4);
    } else {
        script = document.getCells().map(convertCell).join('\n\n');
    }
    // Ensure the connection information is updated, so that its upto date if/when its opened in VS Code.
    const updateConnectionPromise = connection
        ? updateGlobalCache(target.toString().toLowerCase(), connection)
        : Promise.resolve();
    await Promise.all([workspace.fs.writeFile(target, new TextEncoder().encode(script)), updateConnectionPromise]);
}

function convertCell(cell: NotebookCell): string {
    return cell.kind === NotebookCellKind.Markup ? convertMarkdownCell(cell) : convertCodeCell(cell);
}
function convertMarkdownCell(cell: NotebookCell): string {
    return cell.document
        .getText()
        .split(/\r?\n/g)
        .map((line) => `// ${line}`)
        .join('\n');
}
function convertCodeCell(cell: NotebookCell): string {
    return cell.document.getText();
}

function convertCellToJupyter(cell: NotebookCell): IMarkdownCell | ICodeCell {
    return cell.kind === NotebookCellKind.Markup ? convertMarkdownCellToJupyter(cell) : convertCodeCellToJupyter(cell);
}
function convertMarkdownCellToJupyter(cell: NotebookCell): IMarkdownCell {
    const lines = cell.document.getText().split(/\r?\n/g);
    return {
        cell_type: 'markdown',
        metadata: {},
        source: lines
    };
}
function convertCodeCellToJupyter(cell: NotebookCell): ICodeCell {
    const lines = cell.document.getText().split(/\r?\n/g);
    return {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: ['%%kql', ...lines]
    };
}
