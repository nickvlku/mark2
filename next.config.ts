import type { NextConfig } from "next";
import path from "path";

// Detect if we're running inside a .mark2/clones/{task} directory
// If so, use a unique .next directory to avoid lock conflicts with the main project
function getDistDir(): string | undefined {
  const cwd = process.cwd();
  const cloneMatch = cwd.match(/\.mark2[\/\\]clones[\/\\]([^\/\\]+)/);

  if (cloneMatch) {
    // We're in a clone - use a task-specific .next directory
    const taskId = cloneMatch[1];
    return `.next-${taskId}`;
  }

  // Main project - use default .next
  return undefined;
}

const distDir = getDistDir();

const nextConfig: NextConfig = {
  ...(distDir && { distDir }),
};

export default nextConfig;
