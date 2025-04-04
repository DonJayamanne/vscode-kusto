import { QuickInputButtons, QuickPickItem, ThemeIcon } from 'vscode';
import { ReadWrite } from '../../types';
import { create, InputFlowAction, MultiStepInput } from './multiStepInput';
import { AppInsightsConnectionSecrets, IConnectionInfo } from './types';
import { getCachedConnections, updateConnectionCache } from './storage';
import { AzureAuthenticatedConnection } from './azAuth';
import { AppInsightsConnection } from './appInsights';
import { fromConnectionInfo } from '.';
import { createDeferred } from '../../utils';

/**
 * These steps still need to be polished.
 * When selecting a connection, if user attempts to add a new connection, & they click 'Back', where do they go back to?
 * Similarly, what happens when the user goes back & forth...
 * What's the expected behavior.
 */

type State = {
    connection: ReadWrite<IConnectionInfo>;
    kustoSecret?: AppInsightsConnectionSecrets;
    dismissed: boolean;
    canGoBackFromAddStep?: boolean;
    shouldCaptureDatabase?: boolean;
};

export async function captureConnectionFromUser(
    currentConnection?: Partial<IConnectionInfo>,
    shouldCaptureDatabase = true
) {
    const state: State = {
        connection: JSON.parse(JSON.stringify(currentConnection || {})),
        dismissed: false,
        shouldCaptureDatabase
    };
    const multiStep = create<typeof state>();
    await multiStep.run(selectConnection, state);
    if (state.dismissed) {
        return;
    }
    return state.connection;
}

export async function addNewConnection() {
    const state: State = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        connection: {} as any,
        dismissed: false,
        canGoBackFromAddStep: false
    };
    const multiStep = create<typeof state>();
    await multiStep.run(addConnection, state);
    if (state.dismissed) {
        return;
    }
    return state.connection;
}

async function selectConnection(multiStepInput: MultiStepInput<State>, state: State) {
    const connections = getCachedConnections();
    if (connections.length === 0) {
        state.canGoBackFromAddStep = false;
        return addConnection(multiStepInput, state);
    }
    const buildQuickPickItems = () => {
        const connections = getCachedConnections();
        const quickPickItems: (QuickPickItem & { connection: IConnectionInfo })[] = connections.map((item) => ({
            label: item.displayName,
            description: 'cluster' in item ? item.cluster : '',
            connection: item,
            buttons: [{ iconPath: new ThemeIcon('trash'), tooltip: 'Delete Connection' }]
        }));
        return quickPickItems;
    };

    const deletedPromise = createDeferred<undefined>();
    const selection = await Promise.race([
        deletedPromise.promise,
        multiStepInput.showQuickPick({
            title: 'Select a connection',
            matchOnDescription: true,
            matchOnDetail: true,
            canGoBack: false,
            items: buildQuickPickItems(),
            buttons: [
                {
                    iconPath: new ThemeIcon('add'),
                    tooltip: 'Add Connection'
                }
            ],
            placeholder: '',
            onDidTriggerItemButton: async (e, quickPick) => {
                if (e.button.tooltip === 'Delete Connection') {
                    const connection = (e.item as unknown as QuickPickItem & { connection: IConnectionInfo }).connection;
                    if (connection === undefined) {
                        return;
                    }
                    await updateConnectionCache({ info: connection, action: 'remove' });
                    quickPick.items = buildQuickPickItems();
                    // deletedPromise.resolve();
                }
            }
        })
    ]);
    if (!selection) {
        state.dismissed = true;
    } else if ('iconPath' in selection) {
        // Add a new cluster.
        return addConnection(multiStepInput, state);
    } else if ('description' in selection) {
        state.connection = JSON.parse(
            JSON.stringify((selection as QuickPickItem & { connection: IConnectionInfo }).connection)
        );
        if (state.connection.type === 'azAuth') {
            return selectDatabase(multiStepInput, state);
        }
    } else {
        state.dismissed = true;
    }
}
async function addConnection(multiStepInput: MultiStepInput<State>, state: State) {
    const addCluster = 'Add Azure Data Explorer cluster';
    const addAppInsight = 'Add Azure Application Insights';
    const value = await multiStepInput
        .showQuickPick({
            items: [
                {
                    label: addCluster,
                    description: 'Authenticate using Azure Identity',
                    detail: `E.g. https://help.kusto.windows.net`
                },
                {
                    label: addAppInsight,
                    description: 'Authenticate using AppId, AppKey',
                    detail: 'https://docs.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview'
                }
            ],
            matchOnDescription: true,
            matchOnDetail: true,
            canGoBack: typeof state === 'undefined' || state.canGoBackFromAddStep === true,
            placeholder: 'Select a connection type to create'
        })
        .catch((ex) => {
            if (ex === InputFlowAction.back) {
                return QuickInputButtons.Back;
            }
            throw ex;
        });
    if (!value || value === QuickInputButtons.Back) {
        state.dismissed = true;
        return;
    }
    if ('label' in value) {
        if (value.label === addCluster) {
            return addAzAuthenticatedClusterUriAndSelectDb(multiStepInput, state);
        } else {
            return addAppInsightConnection(multiStepInput, state);
        }
    }
    state.dismissed = true;
}
async function addAzAuthenticatedClusterUriAndSelectDb(multiStepInput: MultiStepInput<State>, state: State) {
    const clusterUri =
        state.connection.type === 'azAuth'
            ? state.connection.cluster || 'https://help.kusto.windows.net'
            : 'https://help.kusto.windows.net';
    const value = await multiStepInput
        .showInputBox({
            prompt: '',
            title: 'Enter Cluster Uri',
            value: clusterUri,
            // buttons: clusters.length ? [QuickInputButtons.Back] : [],
            buttons: [QuickInputButtons.Back],
            // This might be a bad idea (validating as the user types).
            validate: validateClusterConnection
        })
        .catch((ex) => {
            if (ex === InputFlowAction.back) {
                return QuickInputButtons.Back;
            }
            throw ex;
        });
    if (!value) {
        return addConnection(multiStepInput, state);
    }
    if (value === QuickInputButtons.Back) {
        return addConnection(multiStepInput, state);
    }
    if (typeof value === 'string') {
        const newConnection = AzureAuthenticatedConnection.from({ cluster: value });
        await newConnection.save();
        if (state.shouldCaptureDatabase) {
            state.connection = newConnection.info;
            return selectDatabase(multiStepInput, state);
        }
    } else {
        state.dismissed = true;
    }
}
async function addAppInsightConnection(multiStepInput: MultiStepInput<State>, state: State) {
    const value = await multiStepInput
        .showInputBox({
            prompt: '',
            title: 'Enter AppInsight AppId & AppKey delimited by a comma (,)',
            value: 'appid , appkey',
            // buttons: clusters.length ? [QuickInputButtons.Back] : [],
            buttons: [QuickInputButtons.Back],
            validate: validateAppInsightValue
        })
        .catch((ex) => {
            if (ex === InputFlowAction.back) {
                return QuickInputButtons.Back;
            }
            throw ex;
        });
    if (!value) {
        return addConnection(multiStepInput, state);
    }
    if (value === QuickInputButtons.Back) {
        return addConnection(multiStepInput, state);
    }
    if (typeof value === 'string') {
        const [appId, appKey] = value.split(',').map((item) => item.trim());
        const newConnection = AppInsightsConnection.from({ appId, appKey });
        await newConnection.save();
        state.connection = newConnection.info;
        return;
    }
    state.dismissed = true;
}

async function selectDatabase(multiStepInput: MultiStepInput<State>, state: State) {
    if (state.connection.type !== 'azAuth') {
        throw new Error('Invalid selection');
    }
    const schema = await fromConnectionInfo(state.connection).getSchema();
    const quickPickItems = schema.cluster.databases.map((db) => ({ label: db.name }));
    const selection = await multiStepInput
        .showQuickPick({
            title: 'Select a database',
            matchOnDescription: true,
            matchOnDetail: true,
            canGoBack: true,
            items: quickPickItems,
            buttons: [QuickInputButtons.Back],
            placeholder: ''
        })
        .catch((ex) => {
            if (ex === InputFlowAction.back) {
                return QuickInputButtons.Back;
            }
            throw ex;
        });
    if (!selection) {
        state.dismissed = true;
    } else if (selection === QuickInputButtons.Back) {
        return selectConnection(multiStepInput, state);
    } else if ('label' in selection) {
        state.connection.database = selection.label;
    }
}

async function validateClusterConnection(clusterUri = ''): Promise<string | undefined> {
    const connections = getCachedConnections();
    if (clusterUri.length === 0) {
        return 'Cluster Uri cannot be empty';
    }
    if (connections.find((item) => 'cluster' in item && item.cluster === clusterUri)) {
        return 'Entered cluster uri already exists';
    }
    try {
        const info = AzureAuthenticatedConnection.from({ cluster: clusterUri }).info;
        await fromConnectionInfo(info).getSchema({ hideProgress: true });
    } catch (ex) {
        console.error(`Cluster Uri is incorrect or unable to authenticate ${clusterUri}`, ex);
        return 'Cluster Uri is incorrect or authentication failed';
    }
}

async function validateAppInsightValue(value: string): Promise<string | undefined> {
    if (value.trim().length === 0) {
        return 'Value cannot be empty';
    }
    if (value.trim().split(',').length !== 2) {
        return 'Please enter an AppId & AppKey delimited by a comma (,)';
    }
}
