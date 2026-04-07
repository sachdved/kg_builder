/**
 * Graph View Provider - Embeds the React/Cytoscape.js visualizer in a webview panel
 */

import * as vscode from 'vscode';
import { StateManager, KgData, Entity } from '../stateManager';

export class GraphViewProvider {
    private _panel?: vscode.WebviewPanel;
    private _extensionUri: vscode.Uri;
    private _stateManager: StateManager;

    constructor(extensionUri: vscode.Uri, stateManager: StateManager) {
        this._extensionUri = extensionUri;
        this._stateManager = stateManager;
    }

    /**
     * Initialize a webview panel (called by serializer)
     */
    initialize(panel: vscode.WebviewPanel) {
        this._panel = panel;
        this._updateHtml();

        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            async (message: any) => {
                switch (message.type) {
                    case 'getKgData':
                        this._panel!.webview.postMessage({
                            type: 'kgData',
                            data: this._stateManager.getKgData()
                        });
                        break;

                    case 'searchEntities':
                        const results = this._stateManager.searchEntities(
                            message.query,
                            message.entityType,
                            message.limit || 50
                        );
                        this._panel!.webview.postMessage({
                            type: 'searchResults',
                            results: results
                        });
                        break;

                    case 'openEntity':
                        const entity = this._stateManager.getEntity(message.entityId);
                        if (entity) {
                            this.openEntityFile(entity);
                        }
                        break;
                }
            }
        );
    }

    /**
     * Show the graph view panel
     */
    show() {
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.One);
            return;
        }

        this._panel = vscode.window.createWebviewPanel(
            'kgBuilder.graphView',
            'Knowledge Graph',
            vscode.ViewColumn.One,
            {
                retainContextWhenHidden: true,
                enableScripts: true,
                localResourceRoots: [
                    this._extensionUri,
                    vscode.Uri.joinPath(this._extensionUri, 'webviews', 'graph')
                ]
            }
        );

        this._updateHtml();

        // Send initial KG data
        const kgData = this._stateManager.getKgData();
        if (kgData) {
            this._panel.webview.postMessage({
                type: 'kgData',
                data: kgData
            });
        }

        this._panel.onDidDispose(() => {
            this._panel = undefined;
        });
    }

    /**
     * Update the KG data in the webview
     */
    updateKgData() {
        if (this._panel) {
            const kgData = this._stateManager.getKgData();
            this._panel.webview.postMessage({
                type: 'kgData',
                data: kgData
            });
        }
    }

    /**
     * Refresh the view
     */
    refresh() {
        if (this._panel) {
            this.updateKgData();
        }
    }

    /**
     * Open an entity's file
     */
    private openEntityFile(entity: Entity) {
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
     * Update webview HTML content
     */
    private _updateHtml() {
        if (!this._panel) return;

        this._panel.webview.html = this._getSimpleGraphHtml();
    }

    /**
     * Get simple graph HTML (placeholder until full viz is bundled)
     */
    private _getSimpleGraphHtml(): string {
        const kgData = this._stateManager.getKgData() || { entities: {}, relationships: [] };
        const entityCount = Object.keys(kgData.entities).length;
        const relationshipCount = kgData.relationships.length;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Knowledge Graph</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1e1e1e; color: #cccccc; height: 100vh; display: flex; flex-direction: column; }
        .toolbar { padding: 8px 16px; background: #2d2d2d; border-bottom: 1px solid #3c3c3c; display: flex; gap: 8px; align-items: center; }
        .toolbar button { background: #0e639c; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; }
        .toolbar button:hover { background: #1177bb; }
        .toolbar .count { margin-left: auto; color: #888; font-size: 13px; }
        .graph-container { flex: 1; overflow: hidden; position: relative; background: #1e1e1e; }
        .info-panel { position: absolute; top: 10px; left: 10px; background: rgba(45,45,45,0.9); padding: 16px; border-radius: 8px; max-width: 300px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
        .info-panel h3 { margin-bottom: 8px; color: #4ec9b0; }
        .info-panel p { margin-bottom: 4px; font-size: 14px; }
        .info-panel .stat { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #3c3c3c; }
        .info-panel .stat:last-child { border-bottom: none; }
        .node-list { margin-top: 16px; max-height: 200px; overflow-y: auto; }
        .node-item { padding: 4px 8px; margin: 2px 0; background: #3c3c3c; border-radius: 4px; font-size: 13px; cursor: pointer; }
        .node-item:hover { background: #505050; }
        .node-type { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-right: 6px; }
        .type-class { background: #e74c3c; color: white; }
        .type-function { background: #3498db; color: white; }
        .type-file { background: #2ecc71; color: white; }
        .type-variable { background: #f39c12; color: white; }
    </style>
</head>
<body>
    <div class="toolbar">
        <button onclick="vscode.postMessage({type: 'refresh'})">Refresh</button>
        <button onclick="vscode.postMessage({type: 'export'})">Export JSON</button>
        <span class="count">${entityCount} entities, ${relationshipCount} relationships</span>
    </div>
    <div class="graph-container">
        <div class="info-panel">
            <h3>Knowledge Graph Summary</h3>
            <div class="stat"><span>Entities:</span><strong>${entityCount}</strong></div>
            <div class="stat"><span>Relationships:</span><strong>${relationshipCount}</strong></div>
            <div class="stat"><span>Files:</span><strong>${this.getFileCount(kgData)}</strong></div>
            <h4 style="margin-top: 12px; color: #888;">Sample Entities</h4>
            <div class="node-list">
                ${this.getEntityPreviewHtml(kgData)}
            </div>
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'kgData') {
                console.log('Received KG data:', message.data);
            }
        });
    </script>
</body>
</html>`;
    }

    /**
     * Get count of unique files in KG
     */
    private getFileCount(kgData: KgData): number {
        const files = new Set<string>();
        for (const entity of Object.values(kgData.entities) as Entity[]) {
            files.add(entity.file_path);
        }
        return files.size;
    }

    /**
     * Generate HTML preview of sample entities
     */
    private getEntityPreviewHtml(kgData: KgData): string {
        const entities = Object.values(kgData.entities).slice(0, 10) as Entity[];
        const typeClasses: Record<string, string> = {
            CLASS: 'type-class',
            FUNCTION: 'type-function',
            ASYNC_FUNCTION: 'type-function',
            FILE: 'type-file',
            VARIABLE: 'type-variable',
            CONSTANT: 'type-variable'
        };

        return entities.map(entity => {
            const typeClass = typeClasses[entity.type] || '';
            const displayName = entity.id.split('::').pop() || entity.name;
            return `
                <div class="node-item" onclick="vscode.postMessage({type: 'openEntity', entityId: '${entity.id}'})">
                    <span class="node-type ${typeClass}">${entity.type}</span>
                    ${displayName}
                </div>
            `;
        }).join('');
    }
}
