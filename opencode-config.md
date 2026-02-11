## Global `AGENTS.md`

```shell
# Global Skills Index

Skills are discovered from:
- `/path/.config/opencode/projects/*`

Each entry under `projects/` should be a symlink to one repo's `packages/skills` directory.

Current entries:
- `/Users/u0047610/.config/opencode/projects/intent-scheduler`

Usage:
1. Match user intent to `projects/*/<skill>/SKILL.md`.
2. Prefer the smallest relevant skill set.
3. If a linked path is missing, continue with best-effort fallback.
```

## Link to every skills from project

```shell
ln -sfn /your/path/intent-scheduler/packages/skills /your/path/.config/opencode/projects/intent-scheduler
```
