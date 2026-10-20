---
title: Rules — workspace as a knowledge graph
summary: Six ordered principles for files, plus one home per fact and the frontmatter every file carries.
status: active
updated: 2026-10-20
related:
  - .claude/_index.md
---

# Workspace
The workspace is a knowledge graph. Six principles, in order:
1. **Atomic:** one file, one concept.
2. **Modular:** every file readable on its own.
3. **Interlinked:** every file carries `related:` links, with the link back. No orphans.
4. **Indexed:** every file reachable from an `_index.md`; indexes hold links and status only.
5. **Progressive disclosure:** state the point, then link to detail. Auto-loaded files hold identity, principles and links only; procedures go in skills.
6. **Token efficiency:** read index and summary first; open a file only when needed; script deterministic work; link, never paste.

**Reference, never duplicate:** each fact has one home; when it changes, fix every file that restates it in the same commit. Search before creating a file. Capture raw input in [inbox/](../../inbox/_index.md).

Every file's frontmatter: `title`, `summary` (one specific line), `status`, `updated`, `related`.
