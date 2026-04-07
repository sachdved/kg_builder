/**
 * Entity Tree Provider - Displays KG entities in a tree view in the sidebar
 */
import * as vscode from 'vscode';
import { StateManager, Entity } from '../stateManager';
export declare class EntityTreeProvider implements vscode.TreeDataProvider<KgTreeItem> {
    private stateManager;
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<void | KgTreeItem | null | undefined>;
    constructor(stateManager: StateManager);
    /**
     * Refresh the tree view
     */
    refresh(): void;
    /**
     * Get tree item for a data element
     */
    getTreeItem(element: KgTreeItem): vscode.TreeItem;
    /**
     * Get children for an element (or root if no element)
     */
    getChildren(element?: KgTreeItem): Promise<KgTreeItem[]>;
    /**
     * Get root-level items (grouped by directory)
     */
    private getRootItems;
    /**
     * Get children for a specific tree item
     */
    private getChildrenForItem;
    /**
     * Get files in a directory
     */
    private getFilesInDirectory;
    /**
     * Get entities in a file
     */
    private getEntitiesInFile;
    /**
     * Get child entities (for nested structures)
     */
    private getChildEntities;
    /**
     * Get icon for entity type
     */
    private getEntityIcon;
}
/**
 * Tree item for KG entities
 */
export declare class KgTreeItem extends vscode.TreeItem {
    data?: {
        type: 'directory' | 'file' | 'entity';
        path?: string;
        entityId?: string;
        entity?: Entity;
    };
    constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState, data?: any);
    private createTooltip;
}
