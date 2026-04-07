/**
 * Graph View Provider - Embeds the React/Cytoscape.js visualizer in a webview panel
 */
import * as vscode from 'vscode';
import { StateManager } from '../stateManager';
export declare class GraphViewProvider {
    private _panel?;
    private _extensionUri;
    private _stateManager;
    constructor(extensionUri: vscode.Uri, stateManager: StateManager);
    /**
     * Initialize a webview panel (called by serializer)
     */
    initialize(panel: vscode.WebviewPanel): void;
    /**
     * Show the graph view panel
     */
    show(): void;
    /**
     * Update the KG data in the webview
     */
    updateKgData(): void;
    /**
     * Refresh the view
     */
    refresh(): void;
    /**
     * Open an entity's file
     */
    private openEntityFile;
    /**
     * Update webview HTML content
     */
    private _updateHtml;
    /**
     * Get simple graph HTML (placeholder until full viz is bundled)
     */
    private _getSimpleGraphHtml;
    /**
     * Get count of unique files in KG
     */
    private getFileCount;
    /**
     * Generate HTML preview of sample entities
     */
    private getEntityPreviewHtml;
}
