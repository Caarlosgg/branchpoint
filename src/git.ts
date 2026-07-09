import { execSync } from "node:child_process";

function runGit(args: string, cwd?: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw new Error(
      `Fallo al ejecutar "git ${args}". ¿Estás dentro de un repositorio git? Detalle: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function getRepoRoot(): string {
  return runGit("rev-parse --show-toplevel");
}

export function getCurrentBranch(): string {
  const branch = runGit("branch --show-current");
  if (!branch) {
    throw new Error(
      "No se pudo determinar la rama activa (¿estás en un estado de HEAD detached?).",
    );
  }
  return branch;
}
