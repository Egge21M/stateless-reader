# Domain docs

## Layout and reading rules

This repo uses a single-context layout across all workspaces:

- `GLOSSARY.md` at the root defines shared domain vocabulary.
- `docs/adr/` holds architectural decision records.

Before exploring the codebase, read the glossary and ADRs relevant to
the work. If these files are absent, proceed silently. Domain-modeling
creates them when terminology or decisions are resolved.

If a root `GLOSSARY-MAP.md` is introduced later, follow its pointers to
relevant context glossaries and read context ADRs alongside root ADRs.

## Vocabulary

Use glossary terms in issues, proposals, code, and tests. For a missing
concept, reconsider whether it belongs in the domain; record a real gap
for domain-modeling.

## Decision conflicts

Explicitly identify any proposal that contradicts an ADR. Cite the ADR
and explain why its decision should be reconsidered.
