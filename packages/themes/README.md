# @kicbac/themes

Prebuilt appearance presets for Kicbac payment components: `defaultTheme`
(the Kicbac brand look), `darkTheme`, and `minimalTheme` — plus
`createTheme()` for your own.

## Install

```sh
npm install @kicbac/themes
```

## Usage

```tsx
import { KicbacProvider } from "@kicbac/react";
import { darkTheme } from "@kicbac/themes";

<KicbacProvider appearance={{ baseTheme: darkTheme }}>
  <App />
</KicbacProvider>;
```

Override any variable on top of a preset:

```tsx
<KicbacProvider
  appearance={{
    baseTheme: darkTheme,
    variables: { colorPrimary: "#7c3aed", borderRadius: "8px" },
  }}
/>
```

Or build a reusable theme:

```ts
import { createTheme } from "@kicbac/themes";

export const brandTheme = createTheme({
  variables: { colorPrimary: "#0ea5e9", gradientCta: "#0ea5e9", fontFamily: "'DM Sans', sans-serif" },
});
```

Themes are plain data (`{ variables, elements? }`) — the appearance engine in
`@kicbac/js` translates them into both the gateway-iframe CSS and the `--kb-*`
custom properties for the host chrome.
