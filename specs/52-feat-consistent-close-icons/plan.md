# Plan

One pull request. Size **s**, risk **low**. Move the shared lightbox close
to the same top-end corner as advanced help.

```yaml
approach: >
  One pull request moves the shared PhotoLightbox Close preview control from
  left: 16 (top-start) to the trailing top-end edge with insetInlineEnd,
  without changing size, colour, shadow, or the label. Keep the existing top
  offset and add trailing safe-area inset so the button stays tappable below
  App chrome; extra top offset is only for chrome, not to keep it on the
  start side. Take Photo and Quick Share inherit the corner through that
  component; edit FieldWrapper only if helper Close is no longer top-end.
  Add one @faims3/forms vitest that Close preview is on the trailing edge
  and still dismisses, then run the existing FieldWrapper suite.
tasks:
  - key: align-lightbox-close
    title: Move the lightbox close to the top-end corner
    description: >
      Move Close preview in PhotoLightbox from left: 16 to insetInlineEnd,
      keep size, colour, shadow, and the label, and keep top plus trailing
      safe-area inset so it stays tappable below App chrome. Add one forms
      vitest for trailing position and dismiss; run the existing FieldWrapper
      suite; do not edit FieldWrapper unless helper Close is no longer top-end.
    depends_on: []
    files_hint:
      - library/forms/lib/components/PhotoLightbox.tsx
      - library/forms/lib/components/PhotoLightbox.test.tsx
      - library/forms/lib/fieldRegistry/fields/wrappers/FieldWrapper.tsx
      - library/forms/lib/fieldRegistry/fields/wrappers/FieldWrapper.test.tsx
    acceptance:
      - 1
      - 2
      - 3
    risk: low
    size: s
    tier: cheap
```
