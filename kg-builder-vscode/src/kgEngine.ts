/**
 * KG Engine - Manages Python subprocess communication with kg_builder
 */

import * as child_process from 'child_process';
import * as path from 'path';

export interface Entity {
    id: string;
    name: string;
    type: EntityType;
    file_path: string;
    line_number?: number;
    end_line?: number;
    properties?: Record<string, any>;
}

export type EntityType =
    | 'FILE' | 'MODULE' | 'CLASS' | 'FUNCTION' | 'ASYNC_FUNCTION'
    | 'CONSTANT' | 'VARIABLE' | 'IMPORT' | 'DECORATOR';

export interface Relationship {
    source_id: string;
    target_id: string;
    type: RelationshipType;
    line_number?: number;
}

export type RelationshipType =
    | 'CONTAINS' | 'CALLS' | 'INHERITS' | 'IMPORTS'
    | 'INSTANTIATES' | 'DEFINES_IN' | 'USES'
    | 'IMPORTS_RESOLVED_TO' | 'CALLS_RESOLVED';

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
    transitive_callers: Map<string, Entity[]>;  // Changed from number to string keys
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

export class KgEngine {
    private pythonPath: string = 'python';
    private kgBuilderPath: string | null = null;
    private processCache: Map<string, Promise<any>> = new Map();

    constructor(kgBuilderRoot?: string) {
        if (kgBuilderRoot) {
            this.kgBuilderPath = kgBuilderRoot;
        } else {
            // Try to find kg_builder in common locations
            const possiblePaths = [
                process.env.PWD + '/kg_builder',
                process.env.HOME + '/kg_builder',
            ];

            for (const p of possiblePaths) {
                try {
                    this.kgBuilderPath = p;
                    break;
                } catch {
                    // Try next path
                }
            }
        }
    }

    /**
     * Build KG from a directory path using kg_builder
     */
    async buildKnowledgeGraph(targetPath: string, excludePatterns?: string[]): Promise<KgData> {
        const cacheKey = `build:${targetPath}:${JSON.stringify(excludePatterns)}`;

        if (this.processCache.has(cacheKey)) {
            return this.processCache.get(cacheKey)!;
        }

        const promise = this.executePython(['-c',
            `import sys; sys.path.insert(0, "${this.kgBuilderPath || ''}");` +
            `from kg_builder import build_knowledge_graph; import json; ` +
            `kg = build_knowledge_graph("${targetPath}", exclude_patterns=${JSON.stringify(excludePatterns || [])}); ` +
            `print(json.dumps(kg.to_dict()))`
        ]);

        this.processCache.set(cacheKey, promise);
        return promise;
    }

    /**
     * Find entities by query using kg_find_entity tool
     */
    async findEntity(query: string, entityType?: EntityType, maxResults: number = 10): Promise<FindEntityResult> {
        try {
            const result = await this.executePython(['-c',
                `import sys; sys.path.insert(0, "${this.kgBuilderPath || ''}");` +
                `from kg_builder.tools.find_entity import kg_find_entity; ` +
                `from kg_builder.mcp_server import _ensure_kg; ` +
                `kg, _ = _ensure_kg(); ` +
                `import json; print(json.dumps(kg_find_entity(kg, "${query}", ${entityType || 'None'}, None, True, ${maxResults})))`
            ]);

            return {
                success: true,
                matches: result.matches || [],
                count: result.count || 0
            };
        } catch (error) {
            return {
                success: false,
                matches: [],
                count: 0,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Get neighbors of an entity using kg_get_neighbors tool
     */
    async getNeighbors(entityId: string, direction: 'both' | 'incoming' | 'outgoing' = 'both'): Promise<NeighborsResult> {
        try {
            const result = await this.executePython(['-c',
                `import sys; sys.path.insert(0, "${this.kgBuilderPath || ''}");` +
                `from kg_builder.tools.get_neighbors import kg_get_neighbors; ` +
                `from kg_builder.mcp_server import _ensure_kg; ` +
                `kg, _ = _ensure_kg(); ` +
                `import json; print(json.dumps(kg_get_neighbors(kg, "${entityId}", "${direction}", None, 20)))`
            ]);

            return {
                success: true,
                neighbors: result.neighbors || [],
                count: result.count || 0
            };
        } catch (error) {
            return {
                success: false,
                neighbors: [],
                count: 0,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Get callers of an entity using kg_get_callers tool
     */
    async getCallers(entityId: string, maxDepth: number = 1): Promise<CallersResult> {
        try {
            const result = await this.executePython(['-c',
                `import sys; sys.path.insert(0, "${this.kgBuilderPath || ''}");` +
                `from kg_builder.tools.get_callers import kg_get_callers; ` +
                `from kg_builder.mcp_server import _ensure_kg; ` +
                `kg, _ = _ensure_kg(); ` +
                `import json; print(json.dumps(kg_get_callers(kg, "${entityId}", ${maxDepth})))`
            ]);

            return {
                success: true,
                direct_callers: result.direct_callers || [],
                transitive_callers: new Map(Object.entries(result.transitive_callers || {}))
            };
        } catch (error) {
            return {
                success: false,
                direct_callers: [],
                transitive_callers: new Map()
            };
        }
    }

    /**
     * Extract code context using kg_extract_context tool
     */
    async extractContext(entityId: string, maxHops: number = 1): Promise<ContextResult> {
        try {
            const result = await this.executePython(['-c',
                `import sys; sys.path.insert(0, "${this.kgBuilderPath || ''}");` +
                `from kg_builder.tools.extract_context import kg_extract_context; ` +
                `from kg_builder.mcp_server import _ensure_kg; ` +
                `kg, _ = _ensure_kg(); ` +
                `import json; print(json.dumps(kg_extract_context(kg, "${entityId}", ${maxHops}, None)))`
            ]);

            return {
                success: true,
                context: result.context || {}
            };
        } catch (error) {
            return {
                success: false,
                context: {},
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Impact analysis using kg_impact_analysis tool
     */
    async impactAnalysis(entityName: string, depth: number = 2): Promise<ImpactAnalysisResult> {
        try {
            const result = await this.executePython(['-c',
                `import sys; sys.path.insert(0, "${this.kgBuilderPath || ''}");` +
                `from kg_builder.agent_helper import analyze_impact; ` +
                `result = analyze_impact("${entityName}", depth=${depth}); ` +
                `import json; print(json.dumps(result))`
            ]);

            return {
                success: result.success,
                entity_name: result.entity_name,
                risk_level: result.risk_level || 'LOW',
                affected_files: result.affected_files || 0,
                reasons: result.reasons || []
            };
        } catch (error) {
            return {
                success: false,
                entity_name: entityName,
                risk_level: 'HIGH',
                affected_files: 0,
                reasons: [error instanceof Error ? error.message : String(error)]
            };
        }
    }

    /**
     * Understand function using kg_understand_function tool
     */
    async understandFunction(functionName: string): Promise<UnderstandFunctionResult> {
        try {
            const result = await this.executePython(['-c',
                `import sys; sys.path.insert(0, "${this.kgBuilderPath || ''}");` +
                `from kg_builder.agent_helper import understand_function; ` +
                `result = understand_function("${functionName}"); ` +
                `import json; print(json.dumps(result))`
            ]);

            return {
                success: result.success,
                function: result.function,
                code_snippet: result.code_snippet,
                calls: result.calls || [],
                called_by: result.called_by || []
            };
        } catch (error) {
            return {
                success: false,
                calls: [],
                called_by: [],
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Export KG to JSON file
     */
    async exportKgJson(outputPath: string): Promise<{ success: boolean; path?: string; error?: string }> {
        try {
            await this.executePython(['-c',
                `import sys; sys.path.insert(0, "${this.kgBuilderPath || ''}");` +
                `from kg_builder.mcp_server import _ensure_kg; ` +
                `import json; ` +
                `kg, kg_dict = _ensure_kg(); ` +
                `with open("${outputPath}", "w") as f: json.dump(kg_dict, f, indent=2); ` +
                `print(json.dumps({"success": true, "path": "${outputPath}"}))`
            ]);

            return { success: true, path: outputPath };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private async executePython(args: string[]): Promise<any> {
        return new Promise((resolve, reject) => {
            const proc = child_process.spawn(this.pythonPath, args);
            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data: Buffer) => {
                stdout += data.toString();
            });
            proc.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    try {
                        resolve(JSON.parse(stdout));
                    } catch (e) {
                        reject(new Error(`Invalid JSON response: ${stdout}`));
                    }
                } else {
                    reject(new Error(`Process failed with code ${code}: ${stderr}`));
                }
            });

            proc.on('error', (err) => {
                reject(err);
            });
        });
    }
}
