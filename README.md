# CVVD Lab

Site for the Computer Vision & Visual Diagnostics Lab, Monash University Malaysia.

Static HTML, CSS and JavaScript. No build step, no dependencies, no package
manager — open `index.html` or serve the folder and it runs.

## Local

```bash
python3 -m http.server 4173
```

Then visit <http://127.0.0.1:4173>.

## Layout

| Path | |
|---|---|
| `index.html` | Home: hero, inspection viewer, capabilities, application areas, news |
| `team.html` | People |
| `publications.html` | Publication record |
| `recruitment.html` | Openings |
| `styles.css` | Design tokens and all component styles |
| `waves.js` | 3D wave-field background (WebGL2, with an image fallback) |
| `main.js` | Header, navigation, inspection viewer, flip cards, scroll reveal |
| `logo-cvvd.svg` | Standalone mark |
| `team-*.{jpg,webp}` | Optimised portraits, 1x and 2x |

`_source/` holds photo originals, logo explorations and personal records. It is
gitignored and is not needed to build or serve the site.

## Conventions

- **Colour carries meaning.** `--signal` is the system looking; `--fault` is the
  thing that is wrong. Everything else stays neutral, or those two stop meaning
  anything. Never use either decoratively.
- **Cache busting.** Asset URLs carry `?v=N`. Bump it in all four HTML files
  whenever `styles.css`, `main.js` or `waves.js` changes, or returning visitors
  get a stale mix.
- **Motion is atmosphere.** Everything animated is safe to switch off, and does
  switch off under `prefers-reduced-motion`.
