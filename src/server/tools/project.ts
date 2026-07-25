import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ProjectContextRef } from '../../core/project-context.js';

export function registerProjectTools(server: McpServer, ref: ProjectContextRef): void {
  server.registerTool(
    'openspec_set_project',
    {
      description: 'Establece la ruta del proyecto activo para las operaciones de OpenSpec',
      inputSchema: {
        path: z.string().describe('Ruta absoluta al directorio del proyecto'),
      },
    },
    async ({ path }: { path: string }) => {
      // Resolver path relativo si no empieza con /
      const resolved = path.startsWith('/') ? path : `${process.cwd()}/${path}`;
      ref.current = resolved;
      return {
        content: [{ type: 'text', text: `✅ Ruta del proyecto establecida a: ${resolved}` }],
      };
    }
  );
}
