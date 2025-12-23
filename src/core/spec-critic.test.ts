/**
 * Spec Critic Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SpecCritic, CritiqueResult } from './spec-critic.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('SpecCritic', () => {
  let tempDir: string;
  let critic: SpecCritic;

  beforeEach(async () => {
    // 创建临时目录
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-critic-test-'));
    critic = new SpecCritic({ cwd: tempDir });
    
    // 创建 openspec 目录结构
    const changeDir = path.join(tempDir, 'openspec', 'changes', 'test-change');
    await fs.mkdir(changeDir, { recursive: true });
  });

  describe('critiqueProposal', () => {
    it('should detect missing problem description', async () => {
      // 创建缺少问题描述的 proposal
      const proposalPath = path.join(tempDir, 'openspec', 'changes', 'test-change', 'proposal.md');
      await fs.writeFile(proposalPath, `
# Solution

This is the solution.
      `);

      const result = await critic.critiqueProposal('test-change');
      
      expect(result.changeName).toBe('test-change');
      expect(result.documentType).toBe('proposal');
      expect(result.critiques.some(c => c.id.length > 0)).toBe(true);
      
      // 应该检测到缺少问题描述
      const missingProblem = result.critiques.find(c => 
        c.category === 'completeness' && c.title.includes('问题')
      );
      expect(missingProblem).toBeDefined();
    });

    it('should detect missing solution', async () => {
      const proposalPath = path.join(tempDir, 'openspec', 'changes', 'test-change', 'proposal.md');
      await fs.writeFile(proposalPath, `
# Problem

This is the problem.
      `);

      const result = await critic.critiqueProposal('test-change');
      
      // 应该检测到缺少解决方案
      const missingSolution = result.critiques.find(c => 
        c.category === 'completeness' && c.title.includes('解决方案')
      );
      expect(missingSolution).toBeDefined();
    });

    it('should detect TODO placeholders', async () => {
      const proposalPath = path.join(tempDir, 'openspec', 'changes', 'test-change', 'proposal.md');
      await fs.writeFile(proposalPath, `
# Problem

We need to fix this issue.

# Solution

TODO: Implement the solution

TBD: Decide on the approach
      `);

      const result = await critic.critiqueProposal('test-change');
      
      // 应该检测到 TODO
      const todoFound = result.critiques.find(c => 
        c.category === 'feasibility' && c.title.includes('TODO')
      );
      expect(todoFound).toBeDefined();
    });

    it('should detect short documents', async () => {
      const proposalPath = path.join(tempDir, 'openspec', 'changes', 'test-change', 'proposal.md');
      await fs.writeFile(proposalPath, 'Short doc.');

      const result = await critic.critiqueProposal('test-change');
      
      // 应该检测到文档过短
      const tooShort = result.critiques.find(c => 
        c.category === 'clarity' && c.title.includes('过短')
      );
      expect(tooShort).toBeDefined();
    });

    it('should give high score for complete document', async () => {
      const proposalPath = path.join(tempDir, 'openspec', 'changes', 'test-change', 'proposal.md');
      await fs.writeFile(proposalPath, `
# Problem

We have a significant issue with our authentication system. Users are experiencing slow login times due to synchronous database queries. This affects user experience and increases server load during peak hours.

# Solution

We will implement asynchronous authentication with Redis caching:
1. Cache user sessions in Redis
2. Use async/await for database queries
3. Add connection pooling

## Impact

This change affects:
- login.ts - Main authentication handler
- session-manager.ts - Session storage
- redis-client.ts - Cache layer

## Error Handling

We handle errors by:
- Retry logic for Redis connection failures
- Fallback to database if cache miss
- Proper exception propagation

## Security

Authentication tokens are:
- Encrypted with AES-256
- Rotated every 24 hours
- Validated server-side
      `);

      const result = await critic.critiqueProposal('test-change');
      
      // 完整文档应该得高分
      expect(result.overallScore).toBeGreaterThanOrEqual(7);
      expect(result.summary.critical).toBe(0);
    });
  });

  describe('getCritiqueHistory', () => {
    it('should return empty array when no history', async () => {
      const history = await critic.getCritiqueHistory('nonexistent-change');
      expect(history).toEqual([]);
    });
  });

  describe('saveCritiqueResult', () => {
    it('should save and retrieve critique result', async () => {
      const result: CritiqueResult = {
        changeName: 'test-change',
        documentType: 'proposal',
        overallScore: 7.5,
        critiques: [],
        suggestions: ['Test suggestion'],
        summary: {
          total: 0,
          critical: 0,
          warning: 0,
          info: 0,
          byCategory: {
            completeness: 0,
            feasibility: 0,
            security: 0,
            edge_case: 0,
            clarity: 0,
          },
        },
        createdAt: new Date().toISOString(),
      };

      await critic.saveCritiqueResult(result);
      
      const history = await critic.getCritiqueHistory('test-change');
      expect(history.length).toBe(1);
      expect(history[0].overallScore).toBe(7.5);
    });
  });
});
