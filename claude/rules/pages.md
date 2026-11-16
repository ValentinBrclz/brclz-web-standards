---
paths:
  - "src/pages/**"
  - "src/layouts/**"
  - "src/components/**"
---

# Pages

- Every indexable page has one `<h1>`, a unique title and description, and its canonical URL
  from `buildPageMeta()` (production origin, configured trailing slash).
- Essential content is in the HTML, not rendered only by JavaScript.
- No inline `<script>` or `<style>` unless the CSP allows it; `brclz audit-dist` reports them.
- Structured data states only facts visible on the page; never invent dates, prices or ratings.
- Accessibility target is WCAG 2.2 AA: labelled controls, visible focus, sufficient contrast.
