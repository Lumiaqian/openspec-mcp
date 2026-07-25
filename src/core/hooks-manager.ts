/**
 * Git Hooks 管理器
 * 管理 OpenSpec Git hooks 的安装和卸载
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ProjectContextRef } from './project-context.js';

const PRE_COMMIT_SCRIPT = `#!/bin/sh
# OpenSpec pre-commit hook
# Validates tasks.md format in staged changes

echo "🔍 OpenSpec: Validating staged changes..."

# Check if there are any tasks.md files being committed
STAGED_TASKS=$(git diff --cached --name-only | grep "openspec/changes/.*/tasks.md")

if [ -n "$STAGED_TASKS" ]; then
  for file in $STAGED_TASKS; do
    # Check for malformed task items
    if grep -qE "^\\s*-\\s*\\[\\s*[^x -]\\s*\\]" "$file"; then
      echo "❌ Invalid task format in $file"
      echo "   Task checkbox must be [ ], [x], or [-]"
      exit 1
    fi
  done
  echo "✅ Tasks format valid"
fi

# Check for proposal.md without tasks.md
STAGED_PROPOSALS=$(git diff --cached --name-only | grep "openspec/changes/.*/proposal.md")
for proposal in $STAGED_PROPOSALS; do
  changeDir=$(dirname "$proposal")
  tasksFile="$changeDir/tasks.md"
  if [ ! -f "$tasksFile" ] && ! git diff --cached --name-only | grep -q "$tasksFile"; then
    echo "⚠️  Warning: $proposal has no corresponding tasks.md"
  fi
done

echo "✅ OpenSpec validation passed"
exit 0
`;

const POST_MERGE_SCRIPT = `#!/bin/sh
# OpenSpec post-merge hook
# Suggests archiving completed changes after merge

echo "📦 OpenSpec: Checking for completed changes..."

# Find changes with 100% completion
for changeDir in openspec/changes/*/; do
  if [ -d "$changeDir" ] && [ "$(basename "$changeDir")" != "archive" ]; then
    tasksFile="$changeDir/tasks.md"
    if [ -f "$tasksFile" ]; then
      # Count total and completed tasks
      total=$(grep -cE "^\\s*-\\s*\\[" "$tasksFile" || echo 0)
      done=$(grep -cE "^\\s*-\\s*\\[x\\]" "$tasksFile" || echo 0)
      
      if [ "$total" -gt 0 ] && [ "$total" -eq "$done" ]; then
        changeName=$(basename "$changeDir")
        echo "💡 Change '$changeName' is 100% complete!"
        echo "   Consider archiving: openspec archive $changeName"
      fi
    fi
  fi
done

exit 0
`;

export class HooksManager {
  private ref: ProjectContextRef;

  constructor(options: { ref: ProjectContextRef }) {
    this.ref = options.ref;
  }

  /**
   * 获取 Git hooks 目录
   */
  private getHooksDir(): string {
    return path.join(this.ref.current, '.git', 'hooks');
  }

  /**
   * 检查是否在 Git 仓库中
   */
  async isGitRepo(): Promise<boolean> {
    try {
      await fs.access(path.join(this.ref.current, '.git'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取已安装的 hooks
   */
  async getInstalledHooks(): Promise<string[]> {
    const installed: string[] = [];
    const hooksDir = this.getHooksDir();

    for (const hookName of ['pre-commit', 'post-merge']) {
      const hookPath = path.join(hooksDir, hookName);
      try {
        const content = await fs.readFile(hookPath, 'utf-8');
        if (content.includes('OpenSpec')) {
          installed.push(hookName);
        }
      } catch {
        // Hook not installed
      }
    }

    return installed;
  }

  /**
   * 安装 Git hooks
   */
  async install(): Promise<{
    success: boolean;
    installed: string[];
    error?: string;
  }> {
    if (!(await this.isGitRepo())) {
      return { success: false, installed: [], error: 'Not a Git repository' };
    }

    const hooksDir = this.getHooksDir();
    const installed: string[] = [];

    try {
      // 确保 hooks 目录存在
      await fs.mkdir(hooksDir, { recursive: true });

      // 安装 pre-commit hook
      const preCommitPath = path.join(hooksDir, 'pre-commit');
      await this.installHook(preCommitPath, PRE_COMMIT_SCRIPT);
      installed.push('pre-commit');

      // 安装 post-merge hook
      const postMergePath = path.join(hooksDir, 'post-merge');
      await this.installHook(postMergePath, POST_MERGE_SCRIPT);
      installed.push('post-merge');

      return { success: true, installed };
    } catch (error: any) {
      return { success: false, installed, error: error.message };
    }
  }

  /**
   * 安装单个 hook
   */
  private async installHook(hookPath: string, script: string): Promise<void> {
    // 检查是否存在现有 hook
    try {
      const existing = await fs.readFile(hookPath, 'utf-8');
      if (existing && !existing.includes('OpenSpec')) {
        // 备份现有 hook
        await fs.writeFile(`${hookPath}.backup`, existing);
        // 附加到现有 hook
        await fs.writeFile(hookPath, existing + '\n\n' + script, { mode: 0o755 });
        return;
      }
    } catch {
      // Hook 不存在
    }

    // 直接写入新 hook
    await fs.writeFile(hookPath, script, { mode: 0o755 });
  }

  /**
   * 卸载 Git hooks
   */
  async uninstall(): Promise<{
    success: boolean;
    removed: string[];
    error?: string;
  }> {
    const hooksDir = this.getHooksDir();
    const removed: string[] = [];

    try {
      for (const hookName of ['pre-commit', 'post-merge']) {
        const hookPath = path.join(hooksDir, hookName);
        try {
          const content = await fs.readFile(hookPath, 'utf-8');
          if (content.includes('OpenSpec')) {
            // 检查是否有备份
            const backupPath = `${hookPath}.backup`;
            try {
              const backup = await fs.readFile(backupPath, 'utf-8');
              await fs.writeFile(hookPath, backup, { mode: 0o755 });
              await fs.unlink(backupPath);
            } catch {
              // 没有备份，直接删除
              await fs.unlink(hookPath);
            }
            removed.push(hookName);
          }
        } catch {
          // Hook 不存在
        }
      }

      return { success: true, removed };
    } catch (error: any) {
      return { success: false, removed, error: error.message };
    }
  }
}
