---
publish: false
---

# Writing Guide (for the blog)

Rules for writing notes in this vault so they publish correctly through the `obsidian-blog` site. This folder has a
`.nopublish` marker, so nothing in it is ever synced or deployed.

## Publishing flow

1. Write in Obsidian, in normal Obsidian-flavoured Markdown (`.md`). `.mdx` also works if a note needs JSX.
2. In the `obsidian-blog` checkout: `pnpm sync` (or `pnpm sync:watch` while writing), check with `pnpm dev`.
3. Commit `content/` and `public/attachments/`, push. Your host (Vercel) builds from the repo; it never sees this vault.

## Visibility

| Want                                                                                                     | Do                                                                                  |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Public (default)                                                                                         | nothing                                                                             |
| Private: not polished enough to publish yet (synced and committed, hidden on the site except for admins) | `visibility: private` (or `private: true`, or tag `#private`)                       |
| Private folder tree                                                                                      | `visibility: private` in the folder note, or an empty `.private` file in the folder |
| Not synced: never leaves the vault, never in git (note)                                                  | `publish: false` or `draft: true`                                                   |
| Not synced (folder tree)                                                                                 | `publish: false` in the folder note, or an empty `.nopublish` file in the folder    |

Folder rules cascade to every subfolder and are sticky: a note cannot make itself public inside a private tree.
Private is not secret: private notes are committed to the blog repo (`content/_private/`), so anyone who can read
that repo can read them (if the repo is public, that is everyone). Anything that must not be public goes in a
not-synced note or folder.
Attachments used only by private notes are not published (the sync warns about them).

## Frontmatter

```yaml
---
title: Optional, else the first "# H1", else the filename without its number prefix
description: One sentence for cards, search and SEO. Else a leading summary/info/note callout, else the first paragraph.
date: 2025-01-31 # or `created`; the sync fills `created` from the file time if both are missing
updated: 2025-02-14 # or `modified`, optional
tags: [topic, subtopic]
aliases: [Other name] # wikilinks may target an alias
cover: cover.svg # or image/banner; a file in the vault, copied to /attachments
visibility: private # optional, see above
author: Ada Lovelace # who wrote it: a name, a list, or a [[wikilink]] to an author note; else the default author
social-image: share.png # raster ~1200x630 for link previews; else a non-SVG cover, else the site image
noindex: true # keep it published but out of search engines and the sitemap
canonical: https://other.site/post # original URL, only for cross-posts
schema: TechArticle # Article | BlogPosting | TechArticle; default BlogPosting, TechArticle in a course
level: beginner # beginner | intermediate | advanced (shown to search engines)
---
```

- `social-image` should be a raster (PNG/JPG, ~1200×630): social sites do not render SVG covers. Without it the
  site uses the cover if it is not an SVG, then the site image, then `/og.png`.
- `noindex: true` keeps a note published and linkable but tells search engines to skip it (it also leaves the
  sitemap). It is not privacy: use `visibility: private` to hide a note, `publish: false` to keep it off the site.
- `canonical` is only for cross-posts (the note first appeared elsewhere). Leave it out otherwise: the site sets
  its own canonical URL, and a note with `canonical` drops out of the sitemap.
- Tags are lowercased and deduped; inline `#tags` in the body count too (not in code, headings or URLs).
- Start the body with `# Title` matching the title; the site renders the title itself and drops that H1.
- Use `##`–`####` for sections; they become the table of contents and `#anchor` targets.

## Courses (series)

- A folder of numbered notes is a course: `00 Index.md`, `01 Basics.md`, … The number is the part order
  (gaps are fine) and is hidden from titles and URLs.
- Give each course a main note: `<folder>/<folder>.md` (preferred, e.g. `example-course/example-course.md`),
  or `<folder>.md` next to the folder, or `<folder>/index.md`. Frontmatter `title`, `description`, `cover`.
  Its body is the course intro on `/series/<folder>`; list the parts there with wikilinks.
- The main note's `level`, `social-image` and `author` apply to the whole course (its page, markup and cards).
- Keep a designed cover (`cover.svg`, ~1600×900, readable on light and dark, no external fonts) in the folder.

## Site notes

Site-wide settings and authors come from ordinary notes, not from code. Any note, anywhere in the vault, whose
frontmatter has a `site:` key is a site note. It is never published as a page, and it is read even inside a
`.nopublish` folder, so keep them together in `_site/` with a `.nopublish` marker. `draft: true` disables one.
The sync aggregates them into `content/site.json`.

**Their data is public.** `content/site.json` is committed to the blog repo and shipped to every visitor. Never
put secrets, private emails or anything unpublished in a site note.

`site: settings` (zero or more; merged in vault-path order, a later note overrides a field an earlier one set, and
the sync warns on such an override). All keys are optional:

```yaml
---
site: settings
title: My Garden # else the first "# H1", else "Obsidian Garden"
description: What this site is about. # else the body's first paragraph
url: https://example.com # canonical origin, no trailing slash needed
locale: en # BCP-47, default en
image: share.png # default social image (raster, ~1200x630), resolved like an embed
keywords: [react, internals]
twitter: "@handle"
block-crawlers: [GPTBot, CCBot] # user agents to Disallow in robots.txt
---
```

`site: author` (one note per person):

```yaml
---
site: author
name: Ada Lovelace # else title, else the first "# H1", else the filename
aliases: [Ada] # other names that notes may use in `author`
description: Short bio. # else the body's first paragraph
url: https://example.com/about
image: ada.jpg # avatar, resolved like an embed
same-as: [https://github.com/ada, https://mastodon.example/@ada]
twitter: "@ada"
job-title: Engineer
default: true # the default author; else the first author by vault path
---
```

Notes without `author` use the default author. A note's `author` may be a name, an alias, or a `[[wikilink]]` to an
author note. Unknown `site:` values are ignored with a warning. Images used by site notes are published like any
other attachment.

## SEO

Automatic: `/sitemap.xml`, `/robots.txt`, `/rss.xml`, a canonical URL, Open Graph and Twitter cards, and JSON-LD
per page type (site, person, blog post, breadcrumbs, course, lesson list). Course parts get `TechArticle` markup
and point at their `Course`; other notes are `BlogPosting`. `/search` and `/graph` are `noindex`.

You control the inputs:

- A specific `description`, about 150–160 characters, that says what the reader will learn. It is the search
  snippet and the card text.
- A raster `social-image` for notes or courses that deserve their own preview card.
- `level` and `schema` where the defaults are wrong, and `author` when the default author is not the writer.
- Real values in the `site: settings` note (`url`, `image`, `twitter`), so absolute URLs and cards are right.

## Syntax the site renders

- Wikilinks: `[[Note]]`, `[[Note|text]]`, `[[Note#Heading]]`, `[[#Heading]]`. They resolve by filename
  (case-insensitive) or alias. Links to unpublished or private notes render as plain text, so linking is safe.
- Embeds: `![[image.png]]`, `![[image.png|300]]` (width), audio/video, `![[Other Note]]` (rendered as a link card).
- Callouts: `> [!note]`, `[!summary]`/`[!tldr]`, `[!info]`, `[!tip]`, `[!warning]`, `[!danger]`, `[!example]`,
  `[!quote]`, `[!question]`, `[!success]`, `[!failure]`, `[!bug]`, `[!todo]`; add `-`/`+` (`> [!tip]- Title`)
  to make it collapsible. Open with a `> [!summary] TL;DR` callout: it becomes the description.
- Mermaid: fenced ` ```mermaid ` blocks render as themed diagrams (zoomable). Prefer `flowchart LR/TD`,
  short node labels, `<br/>` for line breaks inside labels.
- Code: fenced blocks with a language (` ```ts `) get highlighting, a label and a copy button.
- Footnotes `[^1]`, tables, task lists, `==highlight==`, `$inline$` and `$$block$$` math (KaTeX).
- `%%comments%%` and block ids (` ^id`) are stripped from the published page.
- Raw HTML inside `.md` is not rendered (Markdown mode); use Markdown, or write the note as `.mdx`.

## Lesson endings

Every course part ends with a recap placed directly above the `← [[prev]] · [[Index]] · [[next]]` navigation line
(footnote definitions stay below that line):

```markdown
## Summary

One paragraph, 3–5 sentences: what the part explained, the mental model to keep, how it connects to the
previous/next part.

### Key takeaways

- **`identifier` or concept**: one sentence on what it does or why it matters.
- 6–9 bullets in the order the note tells the story (up to 10 for long parts).
```

Recaps only restate what the note says (keep its hedges), add no footnotes or line numbers, and use at most a
couple of wikilinks to other parts. Index/MOC notes and the course main note have no recap.

## Style

- Write for your readers: concrete and specific; pin versions and link sources when you cite them.
- One idea per section, a diagram where a flow is easier to see than read, a callout for warnings and tips.
- Keep paragraphs short; reading time is computed (~230 wpm, code at half weight).
