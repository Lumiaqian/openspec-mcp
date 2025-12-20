/**
 * 版本号工具
 * 从 package.json 动态读取版本号
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 从 package.json 读取版本号
 */
export function getVersion(): string {
  try {
    const pkgPath = join(__dirname, "../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * 导出版本号常量
 */
export const VERSION = getVersion();
