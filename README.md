# Kusto in Notebooks & Interactive Window

A [Visual Studio Code](https://code.visualstudio.com/) [extension](https://marketplace.visualstudio.com/items?itemName=donjayamanne.kusto) that provides the ability to run Kusto queries in Notebooks as well as plain text files.

### Chat:

<img src=https://raw.githubusercontent.com/donjayamanne/vscode-kusto/main/images/copilot.gif>

### Configure Connection:

<img src=https://raw.githubusercontent.com/donjayamanne/vscode-kusto/main/images/configureConnection.gif>

### Interactive Window:

<img src=https://raw.githubusercontent.com/donjayamanne/vscode-kusto/main/images/interactiveWindow.gif>

### Notebooks:

<img src=https://raw.githubusercontent.com/donjayamanne/vscode-kusto/main/images/notebook.gif>

### Schema View:

<img src=https://raw.githubusercontent.com/donjayamanne/vscode-kusto/main/images/clusters.gif>

# Features

-   Run Kusto Queries
-   Graphs & Data Viewer
-   Code Completion
-   Syntax highlighting
-   Code refactoring
-   Code formatting
-   Kusto panel with access to Clusters, Databases, Tables, etc
-   Run Kusto queries in Plain text files, Notebooks or in an Interactive Window

# Getting Started

-   Open a `*.kql|*.csl` file and start typing to get code completion.
-   Open a `*.kql|*.csl` file and click on the `Run Query` code lense
-   Open a `*.kql|*.csl` file as a notebook
-   Create a file with extension `*.knb` (or use the command `Create Kusto Notebook`)
-   Use the command `Configure Kusto Connection` to configure the Kusto connection for a text file (`*.kql`, `*.csl`).
-   For notebooks, select the cluster and database from via the Kernel Picker.

# Works with Jupyter Notebooks as well (when using [kqlmagic](https://pypi.org/project/Kqlmagic/))

-   This extension augments Jupyter Notebooks with Kusto language features, when using the [Jupyter](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) extension.
-   The extension will automatically detect the cluster and database from cells containing the connection information `kql AzureDataExplorer://code;cluster='help';database='Samples'`.

# Difference between Kusto Notebooks & Jupyter Notebooks (with [kqlmagic](https://pypi.org/project/Kqlmagic/))

-   Kusto Notebooks, there are no additional dependencies.
    -   Authentication against Azure is handled by VS Code.
-   With Jupyter Notebooks, you'll need to install Python and the [kqlmagic](https://pypi.org/project/Kqlmagic/) package.
    -   You can use Python to further analyze the data.

# Roadmap

-   Support for more charts
-   & more...

# Thanks to the contributors

[Joyce Er](https://github.com/joyceerhl),
[SteVen Batten](https://github.com/sbatten),
[Peng Lyu](https://github.com/rebornix),
[Tanha Kabir](https://github.com/tanhakabir)

# License

MIT
