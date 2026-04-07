/**
 * Entity Tree Provider - Displays KG entities in a tree view in the sidebar
 */

import * as vscode from 'vscode';
import { StateManager, Entity } from '../stateManager'; // Note: This imports will need to match kgEngine.ts exports

export class EntityTreeProvider implements vscode.TreeDataProvider<KgTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<KgTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private stateManager: StateManager) {}

    /**
     * Refresh the tree view
     */
    refresh() {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Get tree item for a data element
     */
    getTreeItem(element: KgTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children for an element (or root if no element)
     */
    async getChildren(element?: KgTreeItem): Promise<KgTreeItem[]> {
        const kgData = this.stateManager.getKgData();

        if (!kgData || Object.keys(kgData.entities).length === 0) {
            return [new KgTreeItem(
                '(No knowledge graph loaded)',
                vscode.TreeItemCollapsibleState.None
            )];
        }

        if (element) {
            // Return children of the selected item
            return this.getChildrenForItem(element, kgData);
        }

        // Root level: show files/folders
        return this.getRootItems(kgData);
    }

    /**
     * Get root-level items (grouped by directory)
     */
    private getRootItems(kgData: { entities: Record<string, Entity> }): KgTreeItem[] {
        // Group entities by their parent directory
        const dirMap = new Map<string, Set<string>>();

        for (const entity of Object.values(kgData.entities)) {
            if (entity.type === 'FILE' || entity.type === 'MODULE') continue;

            const dir = entity.file_path.substring(0, entity.file_path.lastIndexOf('/'));
            if (!dir) continue;

            const files = dirMap.get(dir) || new Set();
            files.add(entity.file_path);
            dirMap.set(dir, files);
        }

        // Also add root-level files (no directory)
        const rootFiles = new Set<string>();
        for (const entity of Object.values(kgData.entities)) {
            if (entity.type === 'FILE' || entity.type === 'MODULE') continue;
            if (!entity.file_path.includes('/')) {
                rootFiles.add(entity.file_path);
            }
        }

        const items: KgTreeItem[] = [];

        // Add directory folders
        for (const [dir, files] of dirMap.entries()) {
            const dirName = dir.split('/').pop() || dir;
            const item = new KgTreeItem(
                `📁 ${dirName}`,
                vscode.TreeItemCollapsibleState.Collapsed,
                { type: 'directory', path: dir }
            );
            items.push(item);
        }

        // Add root-level files
        for (const file of rootFiles) {
            const item = new KgTreeItem(
                `📄 ${file}`,
                vscode.TreeItemCollapsibleState.Collapsed,
                { type: 'file', path: file }
            );
            items.push(item);
        }

        return items.sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
    }

    /**
     * Get children for a specific tree item
     */
    private getChildrenForItem(element: KgTreeItem, kgData: { entities: Record<string, Entity> }): KgTreeItem[] {
        if (element.data?.type === 'directory' && element.data.path) {
            // Show files in this directory
            return this.getFilesInDirectory(element.data.path, kgData);
        } else if (element.data?.type === 'file' && element.data.path) {
            // Show entities in this file
            return this.getEntitiesInFile(element.data.path, kgData);
        } else if (element.data?.type === 'entity' && element.data.entityId) {
            // Show child entities (for classes with methods, etc.)
            return this.getChildEntities(element.data.entityId, kgData);
        }

        return [];
    }

    /**
     * Get files in a directory
     */
    private getFilesInDirectory(dirPath: string, kgData: { entities: Record<string, Entity> }): KgTreeItem[] {
        const fileSet = new Set<string>();

        for (const entity of Object.values(kgData.entities)) {
            if (entity.type === 'FILE' || entity.type === 'MODULE') continue;
            if (entity.file_path.startsWith(dirPath + '/')) {
                const fileName = entity.file_path.split('/').pop();
                if (fileName) fileSet.add(fileName);
            }
        }

        return Array.from(fileSet).map(fileName => {
            const fullPath = dirPath + '/' + fileName;
            return new KgTreeItem(
                `📄 ${fileName}`,
                vscode.TreeItemCollapsibleState.Collapsed,
                { type: 'file', path: fullPath }
            );
        });
    }

    /**
     * Get entities in a file
     */
    private getEntitiesInFile(filePath: string, kgData: { entities: Record<string, Entity> }): KgTreeItem[] {
        const entities: Entity[] = [];

        for (const entity of Object.values(kgData.entities)) {
            if (entity.file_path === filePath) {
                entities.push(entity);
            }
        }

        // Sort: classes first, then functions, then variables
        const typeOrder: Record<string, number> = {
            CLASS: 1, FUNCTION: 2, ASYNC_FUNCTION: 3,
            CONSTANT: 4, VARIABLE: 5, IMPORT: 6
        };

        entities.sort((a, b) => {
            const typeDiff = (typeOrder[a.type] || 9) - (typeOrder[b.type] || 9);
            if (typeDiff !== 0) return typeDiff;
            return (a.line_number || 0) - (b.line_number || 0);
        });

        return entities.map(entity => {
            const icon = this.getEntityIcon(entity.type);
            const displayName = entity.name || entity.id.split('::').pop();
            return new KgTreeItem(
                `${icon} ${displayName}`,
                vscode.TreeItemCollapsibleState.None,
                { type: 'entity', entityId: entity.id, entity: entity }
            );
        });
    }

    /**
     * Get child entities (for nested structures)
     */
    private getChildEntities(parentId: string, kgData: { entities: Record<string, Entity> }): KgTreeItem[] {
        const children: Entity[] = [];

        for (const entity of Object.values(kgData.entities)) {
            if (entity.id.startsWith(parentId + '::')) {
                children.push(entity);
            }
        }

        return children.map(entity => {
            const icon = this.getEntityIcon(entity.type);
            const displayName = entity.name || entity.id.split('::').pop();
            return new KgTreeItem(
                `${icon} ${displayName}`,
                vscode.TreeItemCollapsibleState.None,
                { type: 'entity', entityId: entity.id, entity: entity }
            );
        });
    }

    /**
     * Get icon for entity type
     */
    private getEntityIcon(type: string): string {
        const icons: Record<string, string> = {
            CLASS: '🎯',
            FUNCTION: '🔹',
            ASYNC_FUNCTION: '⚡',
            CONSTANT: '🔷',
            VARIABLE: '🔸',
            IMPORT: '📥',
            DECORATOR: '⭐',
            FILE: '📄',
            MODULE: '📦'
        };
        return icons[type] || '📌';
    }
}

/**
 * Tree item for KG entities
 */
export class KgTreeItem extends vscode.TreeItem {
    data?: {
        type: 'directory' | 'file' | 'entity';
        path?: string;
        entityId?: string;
        entity?: Entity;
    };

    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        data?: any
    ) {
        super(label, collapsibleState);

        this.data = data;

        if (data?.type === 'entity') {
            this.contextValue = 'kgEntity';
            this.command = {
                command: 'kgBuilder.goToDefinition',
                title: 'Go to definition',
                arguments: [data]
            };
            this.tooltip = this.createTooltip(data.entity);
        } else if (data?.type === 'file') {
            this.contextValue = 'kgFile';
            this.tooltip = `File: ${data.path}`;
        } else if (data?.type === 'directory') {
            this.contextValue = 'kgDirectory';
            this.tooltip = `Directory: ${data.path}`;
        }
    }

    private createTooltip(entity: Entity): string {
        return `${entity.type}: ${entity.name}\n${entity.file_path}:${entity.line_number || '?'}`;
    }
}
