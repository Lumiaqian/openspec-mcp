/**
 * Project context — shared mutable reference for runtime project path
 */
export interface ProjectContextRef {
  current: string;
}

export function createProjectContext(initialCwd: string): ProjectContextRef {
  return { current: initialCwd };
}
