"use strict";
/**
 * State Manager - Caches KG data in memory and provides lookup methods
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateManager = void 0;
class StateManager {
    constructor(kgEngine) {
        this.kgEngine = kgEngine;
        this.kgData = null;
        this.workspacePath = null;
        this.entityIndex = new Map();
        this.fileIndex = new Map(); // file_path -> entity_ids
        this.excludePatterns = [
            '**/venv/**',
            '**/.venv/**',
            '**/node_modules/**',
            '**/__pycache__/**'
        ];
    }
    /**
     * Load KG for a workspace path
     */
    async loadWorkspaceKg(workspacePath) {
        this.workspacePath = workspacePath;
        this.kgData = await this.kgEngine.buildKnowledgeGraph(workspacePath, this.excludePatterns);
        this.buildIndices();
    }
    /**
     * Build indices for fast lookups
     */
    buildIndices() {
        if (!this.kgData)
            return;
        this.entityIndex.clear();
        this.fileIndex.clear();
        for (const entity of Object.values(this.kgData.entities)) {
            this.entityIndex.set(entity.id, entity);
            const fileSet = this.fileIndex.get(entity.file_path) || new Set();
            fileSet.add(entity.id);
            this.fileIndex.set(entity.file_path, fileSet);
        }
    }
    /**
     * Get the current KG data
     */
    getKgData() {
        return this.kgData;
    }
    /**
     * Get workspace path
     */
    getWorkspacePath() {
        return this.workspacePath;
    }
    /**
     * Check if KG is loaded
     */
    isKgLoaded() {
        return this.kgData !== null;
    }
    /**
     * Get entity by ID
     */
    getEntity(entityId) {
        return this.entityIndex.get(entityId);
    }
    /**
     * Search entities by query (case-insensitive, fuzzy match)
     */
    searchEntities(query, entityType, limit = 50) {
        if (!this.kgData)
            return [];
        const results = [];
        const lowerQuery = query.toLowerCase();
        for (const entity of Object.values(this.kgData.entities)) {
            if (entityType && entity.type !== entityType)
                continue;
            const nameMatch = entity.name.toLowerCase().includes(lowerQuery);
            const idMatch = entity.id.toLowerCase().includes(lowerQuery);
            const pathMatch = entity.file_path.toLowerCase().includes(lowerQuery);
            if (nameMatch || idMatch || pathMatch) {
                results.push(entity);
                if (results.length >= limit)
                    break;
            }
        }
        return results;
    }
    /**
     * Get entities by file path
     */
    getEntitiesByFilePath(filePath) {
        const ids = this.fileIndex.get(filePath);
        if (!ids)
            return [];
        return Array.from(ids)
            .map(id => this.entityIndex.get(id))
            .filter((e) => e !== undefined);
    }
    /**
     * Get entities of a specific type
     */
    getEntitiesByType(entityType) {
        if (!this.kgData)
            return [];
        return Object.values(this.kgData.entities).filter(e => e.type === entityType);
    }
    /**
     * Get all file paths in the KG
     */
    getAllFilePaths() {
        return Array.from(this.fileIndex.keys());
    }
    /**
     * Get count of entities by type
     */
    getEntityCounts() {
        const counts = new Map();
        // Initialize all entity types with 0 count
        for (const type of ['FILE', 'MODULE', 'CLASS', 'FUNCTION', 'ASYNC_FUNCTION',
            'CONSTANT', 'VARIABLE', 'IMPORT', 'DECORATOR']) {
            counts.set(type, 0);
        }
        if (this.kgData) {
            for (const entity of Object.values(this.kgData.entities)) {
                const current = counts.get(entity.type) || 0;
                counts.set(entity.type, current + 1);
            }
        }
        return counts;
    }
    /**
     * Get total entity count
     */
    getTotalEntityCount() {
        return this.kgData ? Object.keys(this.kgData.entities).length : 0;
    }
    /**
     * Get total relationship count
     */
    getTotalRelationshipCount() {
        return this.kgData ? this.kgData.relationships.length : 0;
    }
    /**
     * Invalidate the cache
     */
    invalidateCache() {
        this.kgData = null;
        this.workspacePath = null;
        this.entityIndex.clear();
        this.fileIndex.clear();
    }
}
exports.StateManager = StateManager;
//# sourceMappingURL=stateManager.js.map