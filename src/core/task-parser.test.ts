/**
 * TaskParser 单元测试
 */

import { describe, it, expect } from 'vitest';
import { TaskParser } from './task-parser.js';

describe('TaskParser', () => {
  const parser = new TaskParser();

  describe('parseTasksFromContent', () => {
    it('should parse tasks with ID format', () => {
      const content = `
## Implementation

- [x] **1.1** Complete the first task
- [ ] **1.2** Do the second task
- [-] **1.3** Working on third task
`;
      const tasks = parser.parseTasksFromContent(content);

      expect(tasks).toHaveLength(3);
      expect(tasks[0]).toMatchObject({
        id: '1.1',
        section: 'Implementation',
        title: 'Complete the first task',
        status: 'done',
      });
      expect(tasks[1]).toMatchObject({
        id: '1.2',
        section: 'Implementation',
        title: 'Do the second task',
        status: 'pending',
      });
      expect(tasks[2]).toMatchObject({
        id: '1.3',
        section: 'Implementation',
        title: 'Working on third task',
        status: 'in_progress',
      });
    });

    it('should parse simple tasks without ID', () => {
      const content = `
## Tasks

- [x] First simple task
- [ ] Second simple task
`;
      const tasks = parser.parseTasksFromContent(content);

      expect(tasks).toHaveLength(2);
      expect(tasks[0].title).toBe('First simple task');
      expect(tasks[0].status).toBe('done');
      expect(tasks[0].id).toMatch(/^line-\d+$/);
      expect(tasks[1].title).toBe('Second simple task');
      expect(tasks[1].status).toBe('pending');
    });

    it('should handle nested task IDs', () => {
      const content = `
## Phase 1

- [x] **1.1** Main task
- [ ] **1.1.1** Sub task
- [ ] **1.1.2** Another sub task
`;
      const tasks = parser.parseTasksFromContent(content);

      expect(tasks).toHaveLength(3);
      expect(tasks[0].id).toBe('1.1');
      expect(tasks[1].id).toBe('1.1.1');
      expect(tasks[2].id).toBe('1.1.2');
    });

    it('should handle multiple sections', () => {
      const content = `
## Phase 1

- [x] **1.1** Task in phase 1

## Phase 2

- [ ] **2.1** Task in phase 2
`;
      const tasks = parser.parseTasksFromContent(content);

      expect(tasks).toHaveLength(2);
      expect(tasks[0].section).toBe('Phase 1');
      expect(tasks[1].section).toBe('Phase 2');
    });

    it('should return empty array for content with no tasks', () => {
      const content = `
# Just a title

Some text without any tasks.
`;
      const tasks = parser.parseTasksFromContent(content);
      expect(tasks).toHaveLength(0);
    });
  });

  describe('calculateProgress', () => {
    it('should calculate progress correctly', () => {
      const tasks = [
        { id: '1.1', section: '', title: 'Task 1', status: 'done' as const, line: 1 },
        { id: '1.2', section: '', title: 'Task 2', status: 'done' as const, line: 2 },
        { id: '1.3', section: '', title: 'Task 3', status: 'in_progress' as const, line: 3 },
        { id: '1.4', section: '', title: 'Task 4', status: 'pending' as const, line: 4 },
      ];

      const progress = parser.calculateProgress(tasks);

      expect(progress.total).toBe(4);
      expect(progress.completed).toBe(2);
      expect(progress.inProgress).toBe(1);
      expect(progress.pending).toBe(1);
      expect(progress.percentage).toBe(50);
    });

    it('should handle empty task list', () => {
      const progress = parser.calculateProgress([]);

      expect(progress.total).toBe(0);
      expect(progress.completed).toBe(0);
      expect(progress.percentage).toBe(0);
    });

    it('should round percentage correctly', () => {
      const tasks = [
        { id: '1.1', section: '', title: 'Task 1', status: 'done' as const, line: 1 },
        { id: '1.2', section: '', title: 'Task 2', status: 'pending' as const, line: 2 },
        { id: '1.3', section: '', title: 'Task 3', status: 'pending' as const, line: 3 },
      ];

      const progress = parser.calculateProgress(tasks);
      expect(progress.percentage).toBe(33); // 1/3 = 33.33... rounded to 33
    });
  });
});
