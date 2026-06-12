# AGENTS.md — @kicbac/themes

Data-only appearance presets. No logic beyond `createTheme` (shallow merge
over `defaultTheme`). Types come from `@kicbac/js` (`KicbacTheme`,
`KicbacAppearanceVariables`).

- Brand token source of truth: `todo.md` Appendix D (root repo).
- `defaultTheme` must stay byte-identical to `DEFAULT_APPEARANCE_VARIABLES`
  in `@kicbac/js` — a test asserts the translated output matches.
- Keep themes serializable (plain JSON-able objects, no functions).

```sh
pnpm --filter @kicbac/themes test   # runtime + expectTypeOf type tests
```
