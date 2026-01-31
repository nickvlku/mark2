import type { NextConfig } from "next";

// Detect if we're running inside a .mark2/clones/{task} directory
// If so, use a unique .next directory and set turbopack root to avoid lockfile conflicts
function getCloneConfig(): { distDir?: string; turbopackRoot?: string } {
  const cwd = process.cwd();
  const cloneMatch = cwd.match(/\.mark2[\/\\]clones[\/\\]([^\/\\]+)/);

  if (cloneMatch) {
    // We're in a clone - use a task-specific .next directory
    // and set turbopack root to prevent it from detecting parent lockfiles
    const taskId = cloneMatch[1];
    return {
      distDir: `.next-${taskId}`,
      turbopackRoot: cwd,
    };
  }

  // Main project - use defaults
  return {};
}

const { distDir, turbopackRoot } = getCloneConfig();

const nextConfig: NextConfig = {
  ...(distDir && { distDir }),
  ...(turbopackRoot && {
    turbopack: {
      root: turbopackRoot,
    },
  }),
};

export default nextConfig;
