/**
 * State Manager - Caches KG data in memory and provides lookup methods
 */
import { KgEngine, KgData, Entity, EntityType, Relationship, RelationshipType } from './kgEngine';
export type { Entity, EntityType, Relationship, RelationshipType };
export type { KgData };
export declare class StateManager {
    private kgEngine;
    private kgData;
    private workspacePath;
    private entityIndex;
    private fileIndex;
    excludePatterns: string[];
    constructor(kgEngine: KgEngine);
    /**
     * Load KG for a workspace path
     */
    loadWorkspaceKg(workspacePath: string): Promise<void>;
    /**
     * Build indices for fast lookups
     */
    private buildIndices;
    /**
     * Get the current KG data
     */
    getKgData(): KgData | null;
    /**
     * Get workspace path
     */
    getWorkspacePath(): string | null;
    /**
     * Check if KG is loaded
     */
    isKgLoaded(): boolean;
    /**
     * Get entity by ID
     */
    getEntity(entityId: string): Entity | undefined;
    /**
     * Search entities by query (case-insensitive, fuzzy match)
     */
    searchEntities(query: string, entityType?: EntityType, limit?: number): Entity[];
    /**
     * Get entities by file path
     */
    getEntitiesByFilePath(filePath: string): Entity[];
    /**
     * Get entities of a specific type
     */
    getEntitiesByType(entityType: EntityType): Entity[];
    /**
     * Get all file paths in the KG
     */
    getAllFilePaths(): string[];
    /**
     * Get count of entities by type
     */
    getEntityCounts(): Map<string, number>;
    /**
     * Get total entity count
     */
    getTotalEntityCount(): number;
    /**
     * Get total relationship count
     */
    getTotalRelationshipCount(): number;
    /**
     * Invalidate the cache
     */
    invalidateCache(): void;
}
