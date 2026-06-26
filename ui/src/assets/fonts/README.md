# Vendored Inter

`inter-latin-cv01.woff2` is a Latin subset of Inter Variable v4.1 (https://github.com/rsms/inter), licensed under the SIL Open Font License 1.1 (see `OFL.txt`). The `@fontsource` builds strip Inter's character-variant features during subsetting, so the font is vendored here to keep `tnum`, `cv01`, and the rest.

## Numerals

The UI renders every number with `tabular-nums` (`font-feature-settings: "tnum" 1, "cv01" 1` in `ui/src/style.css`), so the values stay column-aligned and hold their width as live readings update. These use Inter's default tabular figures, including the footed "1": its flat base serif fills the tabular cell, so every digit carries the same side spacing and the "1" sits flush with its neighbours.

An earlier build baked a footless "1" into the tabular slot by swapping in the narrow proportional outline. Inter's footless "1" is only about half the width of the tabular cell, so centered there it floated with roughly twice the side spacing of every other digit and read unevenly. The bake was dropped; tabular numbers now use the stock footed form.

The `opsz` (optical-size) axis is instanced out, leaving a weight-only font; that keeps the file small and sidesteps `font-optical-sizing` interactions.

## Regenerate

From the upstream `InterVariable.woff2` with fontTools (`pip install fonttools brotli`):

```
pyftsubset InterVariable.woff2 \
  --unicodes="U+0000-00FF,U+2000-206F,U+2070-209F,U+20A0-20BF,U+2212,U+2261,U+00B0" \
  --layout-features="kern,calt,ccmp,mark,mkmk,liga,tnum,cv01,zero" \
  --flavor=woff2 --output-file=inter-subset.woff2
fonttools varLib.instancer inter-subset.woff2 opsz=14 -o inter-latin-cv01.woff2
```
