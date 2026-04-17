# Group 7: Helm Rebrand + Splash Screen

**Priority:** MEDIUM — branding and first-run polish after feature work stabilizes
**Estimated complexity:** Medium (branding surfaces, asset work, startup UX)

---

## Goal

Rebrand the app to **Helm** and add a polished splash screen. The visual direction is:

- **Name:** Helm
- **Tagline:** `Helm - steer your fleet of agents`
- **Icon concept:** cute **paper boat** with `|>` on the sail
- **Accent:** green text / green-accent branding

---

## Scope

- Replace user-visible product naming with **Helm**
- Add a startup splash screen that fits the existing Electron app style
- Introduce the new paper-boat branding asset and wire it into the app shell
- Update visible branding surfaces so the app feels consistently renamed

---

## Suggested Branding Direction

### Icon
- Simple paper boat silhouette
- `|>` rendered on the sail
- Green accent for sail mark and/or title text
- Keep it readable at small app-icon sizes

### Tone
- Friendly, operator-like, lightweight
- More "command cockpit" than "toy"
- Minimal, clean, modern

### Splash screen
- App name: **Helm**
- Tagline: `steer your fleet of agents`
- Paper boat mark centered or left-aligned
- Keep load experience fast and understated

---

## Likely Files / Surfaces

| Area | Likely files |
|------|--------------|
| Electron window branding | `src/electron/main.ts`, packaged app metadata, Electron window/title surfaces |
| Renderer visible branding | `renderer/index.html`, renderer UI headers, any hardcoded app name strings |
| Icons / splash assets | existing asset locations under renderer/public/build config as appropriate |
| Packaging metadata | `package.json`, installer/release naming, any Electron builder metadata |
| Documentation | `README.md` and any user-facing docs that mention the old name |

---

## Implementation Notes

1. Find every user-visible product name and replace it intentionally, not blindly
2. Add the splash screen in a way that does not break startup flow or window lifecycle
3. Keep icon generation simple and consistent across small/large sizes
4. Reuse existing color/style tokens where possible instead of inventing a separate theme system
5. Preserve functionality first — rebrand should not alter app behavior

---

## Dependencies

- Best done **after Groups 1-6** so branding lands on top of the final UI shape

---

## Tests / Validation

- Build still succeeds with updated metadata/assets
- Startup still works with splash flow enabled
- Renderer shows updated name consistently
- No broken asset references in packaged or dev builds
