/**
 * KG Builder VS Code Extension - Main entry point
 */

import * as vscode from 'vscode';
import { KgEngine } from './kgEngine';
import { StateManager } from './stateManager';
import { GraphViewProvider } from './providers/graphViewProvider';
import { EntityTreeProvider } from './providers/entityTreeProvider';

// Global state for the extension
let kgEngine: KgEngine;
let stateManager: StateManager;
let graphViewProvider: GraphViewProvider;
let entityTreeProvider: EntityTreeProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('KG Builder extension is now active!');

    // Initialize KG engine with the kg_builder path
    const kgBuilderPath = context.extensionUri.fsPath.replace('/kg-builder-vscode', '');
    kgEngine = new KgEngine(kgBuilderPath);

    // Initialize state manager
    stateManager = new StateManager(kgEngine);

    // Initialize providers
    graphViewProvider = new GraphViewProvider(context.extensionUri, stateManager);
    entityTreeProvider = new EntityTreeProvider(stateManager);

    // Register Tree Data Provider for entity tree
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('kgBuilder.entityTree', entityTreeProvider)
    );

    // Register webview panel serializer for graph view
    context.subscriptions.push(
        vscode.window.registerWebviewPanelSerializer(
            'kgBuilder.graphView',
            {
                async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
                    graphViewProvider.initialize(webviewPanel);
                }
            }
        )
    );

    // Register all commands
    registerCommands(context);

    // Build KG for current workspace on activation if there are Python files
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const workspacePath = workspaceFolders[0].uri.fsPath;
        buildWorkspace(workspacePath);
    }

    // Set up file watchers for auto-rebuild
    const config = vscode.workspace.getConfiguration('kgBuilder');
    if (config.get<boolean>('autoBuildOnSave', false)) {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.py');
        watcher.onDidChange(uri => handleFileChange(uri));
        context.subscriptions.push(watcher);
    }
}

export function deactivate() {
    // Cleanup if needed
}

/**
 * Register all extension commands
 */
function registerCommands(context: vscode.ExtensionContext) {
    // Build Commands
    registerCommand('kgBuilder.buildWorkspace', () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            buildWorkspace(workspaceFolders[0].uri.fsPath);
        } else {
            vscode.window.showWarningMessage('No workspace folder open');
        }
    });

    registerCommand('kgBuilder.buildCurrentFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.scheme === 'file') {
            await buildCurrentFile(editor.document.uri.fsPath);
        } else {
            vscode.window.showWarningMessage('No file is open');
        }
    });

    registerCommand('kgBuilder.invalidateCache', () => {
        stateManager.invalidateCache();
        entityTreeProvider.refresh();
        graphViewProvider.refresh();
        vscode.window.showInformationMessage('KG cache invalidated');
    });

    // Search Commands
    registerCommand('kgBuilder.searchEntities', async () => {
        await searchEntities();
    });

    // Navigation Commands
    registerCommand('kgBuilder.goToDefinition', (item: any) => {
        goToDefinition(item.entityId);
    });

    registerCommand('kgBuilder.showCallHierarchy', async (item: any) => {
        await showCallHierarchy(item.entityId);
    });

    // Analysis Commands
    registerCommand('kgBuilder.analyzeImpact', async () => {
        await analyzeCurrentEntity();
    });

    registerCommand('kgBuilder.extractContext', async () => {
        await extractFunctionContext();
    });

    // View Commands
    registerCommand('kgBuilder.openGraphView', () => {
        graphViewProvider.show();
    });

    registerCommand('kgBuilder.exportKgJson', async () => {
        await exportKgJson();
    });

    function registerCommand(command: string, callback: (...args: any[]) => any) {
        context.subscriptions.push(
            vscode.commands.registerCommand(command, callback)
        );
    }
}

/**
 * Build KG for the entire workspace
 */
async function buildWorkspace(workspacePath: string) {
    const config = vscode.workspace.getConfiguration('kgBuilder');
    const excludePatterns = config.get<string[]>('excludePatterns', [
        '**/venv/**',
        '**/.venv/**',
        '**/node_modules/**',
        '**/__pycache__/**'
    ]);

    const progressOptions: vscode.ProgressOptions = {
        location: vscode.ProgressLocation.Notification,
        title: 'Building Knowledge Graph...'
    };

    try {
        await vscode.window.withProgress(progressOptions, async () => {
            // Update state manager with exclude patterns
            (stateManager as any).excludePatterns = excludePatterns;
            await stateManager.loadWorkspaceKg(workspacePath);

            const entityCount = stateManager.getTotalEntityCount();
            const relCount = stateManager.getTotalRelationshipCount();

            entityTreeProvider.refresh();
            graphViewProvider.updateKgData();

            vscode.window.showInformationMessage(
                `KG built: ${entityCount} entities, ${relCount} relationships`
            );
        });
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to build KG: ${errorMsg}`);
    }
}

/**
 * Build KG for a single file
 */
async function buildCurrentFile(filePath: string) {
    const progressOptions: vscode.ProgressOptions = {
        location: vscode.ProgressLocation.Notification,
        title: 'Building Knowledge Graph for file...'
    };

    try {
        await vscode.window.withProgress(progressOptions, async () => {
            const kgData = await kgEngine.buildKnowledgeGraph(filePath);

            // Store the single-file KG data temporarily
            stateManager = new StateManager(kgEngine);
            (stateManager as any).kgData = kgData;
            (stateManager as any).buildIndices();

            entityTreeProvider.refresh();
            graphViewProvider.updateKgData();

            const entityCount = stateManager.getTotalEntityCount();
            vscode.window.showInformationMessage(
                `KG built for file: ${entityCount} entities`
            );
        });
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to build KG: ${errorMsg}`);
    }
}

/**
 * Search for entities with quick pick
 */
async function searchEntities() {
    if (!stateManager.isKgLoaded()) {
        vscode.window.showWarningMessage('No KG loaded. Build the workspace first.');
        return;
    }

    const query = await vscode.window.showInputBox({
        placeHolder: 'Search for classes, functions, or variables...',
        prompt: 'Enter entity name or partial match'
    });

    if (!query) return;

    const entities = stateManager.searchEntities(query, undefined, 50);

    if (entities.length === 0) {
        vscode.window.showInformationMessage('No entities found');
        return;
    }

    const items = entities.map(entity => ({
        label: entity.name,
        description: `[${entity.type}] ${getFileBasename(entity.file_path)}`,
        detail: `${entity.file_path}:${entity.line_number || '?'}`,
        entity: entity
    }));

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select an entity',
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (selection) {
        openEntityFile(selection.entity);
    }
}

/**
 * Go to entity definition in the editor
 */
function goToDefinition(entityId: string) {
    const entity = stateManager.getEntity(entityId);
    if (!entity) {
        vscode.window.showWarningMessage('Entity not found');
        return;
    }
    openEntityFile(entity);
}

/**
 * Open an entity's file and navigate to its location
 */
function openEntityFile(entity: any) {
    const uri = vscode.Uri.file(entity.file_path);
    vscode.workspace.openTextDocument(uri).then(doc => {
        const lineNumber = entity.line_number || 1;
        const selection = new vscode.Range(
            lineNumber - 1,
            0,
            (entity.end_line || lineNumber) - 1,
            0
        );
        vscode.window.showTextDocument(doc, { selection });
    });
}

/**
 * Show call hierarchy for an entity
 */
async function showCallHierarchy(entityId: string) {
    const callers = await kgEngine.getCallers(entityId, 2);

    if (!callers.success) {
        vscode.window.showWarningMessage('Could not get callers');
        return;
    }

    const totalCallers = callers.direct_callers.length +
        Array.from(callers.transitive_callers.values()).reduce((sum, arr) => sum + arr.length, 0);

    vscode.window.showInformationMessage(
        `Found ${totalCallers} caller(s) for this entity`
    );
}

/**
 * Analyze impact of current entity
 */
async function analyzeCurrentEntity() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No file is open');
        return;
    }

    // Get word range at cursor (simplified - should use proper token parsing)
    const position = editor.selection.active;
    const wordRange = editor.document.getWordRangeAtPosition(position);
    const entityName = wordRange ? editor.document.getText(wordRange) : '';

    if (!entityName) {
        vscode.window.showWarningMessage('Could not determine entity name');
        return;
    }

    const result = await kgEngine.impactAnalysis(entityName, 2);

    if (result.success) {
        const markdown = `# Impact Analysis: ${result.entity_name}

**Risk Level:** ${result.risk_level}

## Affected Files
- ${result.affected_files} files affected

## Reasons for Risk Assessment
${result.reasons.map(r => `- ${r}`).join('\n') || 'None'}
`;

        const doc = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: markdown
        });
        vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    } else {
        vscode.window.showWarningMessage(`Impact analysis failed: ${result.reasons[0]}`);
    }
}

/**
 * Extract function context
 */
async function extractFunctionContext() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No file is open');
        return;
    }

    const position = editor.selection.active;
    const wordRange = editor.document.getWordRangeAtPosition(position);
    const functionName = wordRange ? editor.document.getText(wordRange) : '';

    if (!functionName) {
        vscode.window.showWarningMessage('Could not determine function name');
        return;
    }

    const result = await kgEngine.understandFunction(functionName);

    if (result.success && result.code_snippet) {
        const markdown = `# Function Context: ${functionName}

\`\`\`python
${result.code_snippet}
\`\`\`

## Calls (${result.calls?.length || 0})
${result.calls?.map(c => `- \`${c.name}\``).join('\n') || 'None'}

## Called By (${result.called_by?.length || 0})
${result.called_by?.map(c => `- \`${c.name}\``).join('\n') || 'None'}
`;

        const doc = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: markdown
        });
        vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    } else {
        vscode.window.showWarningMessage('Could not extract function context');
    }
}

/**
 * Export KG to JSON file
 */
async function exportKgJson() {
    const uri = await vscode.window.showSaveDialog({
        filters: { 'JSON Files': ['json'] },
        defaultUri: vscode.Uri.file('kg_export.json')
    });

    if (!uri) return;

    const result = await kgEngine.exportKgJson(uri.fsPath);

    if (result.success) {
        vscode.window.showInformationMessage(`KG exported to ${result.path}`);
    } else {
        vscode.window.showErrorMessage(`Export failed: ${result.error}`);
    }
}

/**
 * Handle file change for auto-rebuild
 */
function handleFileChange(uri: vscode.Uri) {
    if (uri.scheme === 'file' && uri.fsPath.endsWith('.py')) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            // Debounced rebuild would go here
            console.log('File changed:', uri.fsPath);
        }
    }
}

/**
 * Get file basename from path
 */
function getFileBasename(filePath: string): string {
    return filePath.split('/').pop() || filePath;
}
