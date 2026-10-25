---
title: First Part
tags: [example]
---

# First Part

> [!summary] TL;DR
> A note in a numbered folder becomes a course part. This callout doubles as the description.

## How it flows

```mermaid
flowchart LR
  A[Write in Obsidian] --> B[pnpm sync]
  B --> C[Commit]
  C --> D[Vercel deploys]
```

Wikilinks resolve by filename, so this one points back to [[Example Course]].

## Summary

This part showed the smallest possible course: a folder note plus one numbered part. It used a summary callout for
the description, a Mermaid diagram for the publishing flow and a wikilink to the course. Add more numbered notes
to grow the course.

### Key takeaways

- **Folder note**: `example-course/example-course.md` turns the folder into a series.
- **Number prefix**: `01 First Part.md` sets the order and is hidden from titles and URLs.
- **TL;DR callout**: used as the description when the frontmatter has none.
- **Mermaid**: fenced `mermaid` blocks render as themed diagrams.

← [[Example Course]]
