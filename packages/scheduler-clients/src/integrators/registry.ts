import { claudeCodeIntegrator } from "./claude-code";
import { codexCliIntegrator } from "./codex-cli";
import { othersIntegrator } from "./others";
import { opencodeIntegrator } from "./opencode";
import type { IntegratorId, IntegratorModule } from "./types";

const modules: IntegratorModule[] = [
  opencodeIntegrator,
  claudeCodeIntegrator,
  codexCliIntegrator,
  othersIntegrator,
];

const registry = new Map<IntegratorId, IntegratorModule>(modules.map((item) => [item.id, item]));

function normalizeIntegratorId(value: string): IntegratorId {
  const normalized = value.toLowerCase().replace(/-/g, "_");
  if (normalized === "opencode") {
    return "opencode";
  }
  if (normalized === "claude_code") {
    return "claude_code";
  }
  if (normalized === "codex_cli") {
    return "codex_cli";
  }
  if (normalized === "others" || normalized === "other" || normalized === "custom") {
    return "others";
  }
  throw new Error(
    `Unknown INTEGRATOR: ${value}. Supported values: ${Array.from(registry.keys()).join(", ")}`,
  );
}

export function resolveIntegratorModule(value: string): IntegratorModule {
  const id = normalizeIntegratorId(value);
  const module = registry.get(id);
  if (!module) {
    throw new Error(`INTEGRATOR is not configured: ${value}`);
  }
  return module;
}

export function listIntegrators(): IntegratorId[] {
  return Array.from(registry.keys());
}
