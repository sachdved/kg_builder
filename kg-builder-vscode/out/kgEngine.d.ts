/**
 * KG Engine - Manages Python subprocess communication with kg_builder
 */
export interface Entity {
    id: string;
    name: string;
    type: EntityType;
    file_path: string;
    line_number?: number;
    end_line?: number;
    properties?: Record<string, any>;
}
export type EntityType = 'FILE' | 'MODULE' | 'CLASS' | 'FUNCTION' | 'ASYNC_FUNCTION' | 'CONSTANT' | 'VARIABLE' | 'IMPORT' | 'DECORATOR';
export interface Relationship {
    source_id: string;
    target_id: string;
    type: RelationshipType;
    line_number?: number;
}
export type RelationshipType = 'CONTAINS' | 'CALLS' | 'INHERITS' | 'IMPORTS' | 'INSTANTIATES' | 'DEFINES_IN' | 'USES' | 'IMPORTS_RESOLVED_TO' | 'CALLS_RESOLVED';
export interface KgData {
    entities: Record<string, Entity>;
    relationships: Relationship[];
}
export interface FindEntityResult {
    success: boolean;
    matches: Entity[];
    count: number;
    error?: string;
}
export interface NeighborsResult {
    success: boolean;
    neighbors: Entity[];
    count: number;
    error?: string;
}
export interface CallersResult {
    success: boolean;
    direct_callers: Entity[];
    transitive_callers: Map<string, Entity[]>;
    error?: string;
}
export interface ContextResult {
    success: boolean;
    context: Record<string, Entity[]>;
    error?: string;
}
export interface ImpactAnalysisResult {
    success: boolean;
    entity_name: string;
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
    affected_files: number;
    reasons: string[];
    error?: string;
}
export interface UnderstandFunctionResult {
    success: boolean;
    function?: Entity;
    code_snippet?: string;
    calls?: Entity[];
    called_by?: Entity[];
    error?: string;
}
export declare class KgEngine {
    private pythonPath;
    private kgBuilderPath;
    private processCache;
    constructor(kgBuilderRoot?: string);
    /**
     * Build KG from a directory path using kg_builder
     */
    buildKnowledgeGraph(targetPath: string, excludePatterns?: string[]): Promise<KgData>;
    /**
     * Find entities by query using kg_find_entity tool
     */
    findEntity(query: string, entityType?: EntityType, maxResults?: number): Promise<FindEntityResult>;
    /**
     * Get neighbors of an entity using kg_get_neighbors tool
     */
    getNeighbors(entityId: string, direction?: 'both' | 'incoming' | 'outgoing'): Promise<NeighborsResult>;
    /**
     * Get callers of an entity using kg_get_callers tool
     */
    getCallers(entityId: string, maxDepth?: number): Promise<CallersResult>;
    /**
     * Extract code context using kg_extract_context tool
     */
    extractContext(entityId: string, maxHops?: number): Promise<ContextResult>;
    /**
     * Impact analysis using kg_impact_analysis tool
     */
    impactAnalysis(entityName: string, depth?: number): Promise<ImpactAnalysisResult>;
    /**
     * Understand function using kg_understand_function tool
     */
    understandFunction(functionName: string): Promise<UnderstandFunctionResult>;
    /**
     * Export KG to JSON file
     */
    exportKgJson(outputPath: string): Promise<{
        success: boolean;
        path?: string;
        error?: string;
    }>;
    private executePython;
}
