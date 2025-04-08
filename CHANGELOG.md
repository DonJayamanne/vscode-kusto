# Changelog

## 0.5.0 (9 April 2025)

### Enhancements

1. Chat Tool to retrieve Schema for database.
2. Improved Connection Picker for Text Files
3. Improved Kernel Picker for Notebooks and Interactive Window

## 0.4.1 (7 March 2023)

### Enhancements

1. Open *.kql & *.csl files in a Notebook editor.
2. Run queries in *.kql & *.csl files against an Interactive Window.

## 0.3.8 (12 Sept 2021)

### Enhancements

1. Updates to changes in API

## 0.3.7 (25 Aug 2021)

### Enhancements

1. Updates to changes in API

## 0.3.5 (6 Jul 2021)

### Enhancements

1. Updates to changes in API

## 0.0.16 (9 Jun 2021)

### Enhancements

1. Support VS Code Stable

## 0.0.9 (10 May 2021)

### Enhancements

1. Update to use latest VS Code API.

## 0.0.9 (7 April 2021)

### Enhancements

1. Use the last selected connection for all future notebooks (unless explicitly set by user or defined in metadata).

### Fixes
1. Port connection metadata from older *.knb notebooks to the new format.

## 0.0.8 (7 April 2021)

### Fixes
1. Ensure *.kql & *.csl files are detected as kusto files.

### Enhancements

1. Support for Application Insights
1. Better handling of session timeout errors.
1. Improvements to adding connections (Clusters & AppInsights)
1. Added language capabilities for plain text kusto files (*.kql, *.csl)

## 0.0.7 (7 April 2021)
### Enhancements

1. Support for Application Insights
1. Better handling of session timeout errors.
1. Improvements to adding connections (Clusters & AppInsights)
1. Added language capabilities for plain text kusto files (*.kql, *.csl)

## 0.0.6 (4 April 2021)
### Enhancements

1. Optionally save output in the notebook. Defaults to `false`.
1. Create notebooks from the `Kusto` view in Database & Table nodes.
1. Ability to delete connections.

## 0.0.5 (1 April 2021)
### Enhancements

1. Support for language features in Kusto Notebooks (refactor, code completion, formatting, etc)
1. Support for language features in Jupyter Notebooks when using [kqlmagic](https://pypi.org/project/Kqlmagic/)
1. Kust panel, with access to clusters, databases & related information.
1. Improved getting started experience for Notebooks (configuring cluster/database).

## 0.0.2 (30 March 2021)
### Enhancements

1. Better data table viewer
1. Support for time series and scatter charts.
1. Support for viewing nested json.
1. Improved authentication (using VS Code's built-in authentication)
1. Using a custom notebook file (no longer using `*.ipynb`, now using `*.knb`)
1. Storing cluster and database information in the notebook metadata.


## 0.0.1 (29 March 2021)
Initial release

### Thanks

Thanks to the various projects we provide integrations with which help
make this extension useful:

-   [plotly](https://github.com/plotly/plotly.js)
