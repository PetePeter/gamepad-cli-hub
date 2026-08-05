/**
 * artifact-base-css — the fallback stylesheet for HTML artifacts that ship no
 * styling of their own.
 *
 * Policy is "artifact decides, app provides fallback": this is injected ONLY
 * when the document contains no <style>, no stylesheet <link> and no inline
 * style attribute (see build-artifact-document.ts). An author who styled
 * anything gets a bare document and full control.
 *
 * Token values are inlined as literals rather than var(--…) because CSS custom
 * properties do not cross the document boundary — the artifact is served as its
 * own document over helm-artifact://, so it inherits nothing from the app.
 * Values mirror renderer/styles/main.css :root and the .ap-doc :deep() rules in
 * ArtifactViewer.vue, so an unstyled HTML artifact looks like the markdown one.
 */
export const ARTIFACT_BASE_CSS = `
:root { color-scheme: dark; }
body {
  margin: 16px 18px;
  background: #0a0a0a;
  color: #cfcfcf;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 0.82rem;
  line-height: 1.6;
}
h1, h2 { font-size: 1.05rem; margin: 0 0 10px; border-bottom: 1px solid #222222; padding-bottom: 6px; }
h3 { font-size: 0.9rem; margin: 16px 0 6px; color: #4fd08b; }
p { margin: 6px 0; }
ul, ol { margin: 6px 0; padding-left: 20px; }
li { line-height: 1.55; margin: 3px 0; }
code { background: #1a1a1a; padding: 1px 6px; border-radius: 3px; font-family: Consolas, monospace; font-size: 0.76rem; color: #4fd08b; }
pre { background: #1a1a1a; padding: 10px 12px; border-radius: 6px; overflow: auto; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 0.76rem; }
th, td { border: 1px solid #222222; padding: 5px 9px; text-align: left; }
th { background: #1a1a1a; color: #999999; }
/* --blue is referenced but never defined in main.css; use the literal fallback. */
a { color: #6c8cff; }
img { max-width: 100%; border-radius: 6px; border: 1px solid #222222; }
svg { max-width: 100%; height: auto; }
`.trim();
