"use strict";
/**
 * KG Engine - Manages Python subprocess communication with kg_builder
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.KgEngine = void 0;
const child_process = __importStar(require("child_process"));
class KgEngine {
    constructor(kgBuilderRoot) {
        this.pythonPath = 'python';
        this.kgBuilderPath = null;
        this.processCache = new Map();
        if (kgBuilderRoot) {
            this.kgBuilderPath = kgBuilderRoot;
        }
        else {
            // Try to find kg_builder in common locations
            const possiblePaths = [
                process.env.PWD + '/kg_builder',
                process.env.HOME + '/kg_builder',
            ];
            for (const p of possiblePaths) {
                try {
                    this.kgBuilderPath = p;
                    break;
                }
                catch {
                    // Try next path
                }
            }
        }
    }
    /**
     * Build KG from a directory path using kg_builder
     */
    async buildKnowledgeGraph(targetPath, excludePatterns) {
        const cacheKey = `build:${targetPath}:${JSON.stringify(excludePatterns)}`;
        if (this.processCache.has(cacheKey)) {
            return this.processCache.get(cacheKey);
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
    async findEntity(query, entityType, maxResults = 10) {
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
        }
        catch (error) {
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
    async getNeighbors(entityId, direction = 'both') {
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
        }
        catch (error) {
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
    async getCallers(entityId, maxDepth = 1) {
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
        }
        catch (error) {
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
    async extractContext(entityId, maxHops = 1) {
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
        }
        catch (error) {
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
    async impactAnalysis(entityName, depth = 2) {
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
        }
        catch (error) {
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
    async understandFunction(functionName) {
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
        }
        catch (error) {
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
    async exportKgJson(outputPath) {
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
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    async executePython(args) {
        return new Promise((resolve, reject) => {
            const proc = child_process.spawn(this.pythonPath, args);
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            proc.on('close', (code) => {
                if (code === 0) {
                    try {
                        resolve(JSON.parse(stdout));
                    }
                    catch (e) {
                        reject(new Error(`Invalid JSON response: ${stdout}`));
                    }
                }
                else {
                    reject(new Error(`Process failed with code ${code}: ${stderr}`));
                }
            });
            proc.on('error', (err) => {
                reject(err);
            });
        });
    }
}
exports.KgEngine = KgEngine;
//# sourceMappingURL=kgEngine.js.map