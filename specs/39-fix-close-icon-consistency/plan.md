# Plan

One pull request. Size **s**, risk **low**. Move the shared lightbox close to the same top-end corner as advanced help.

```yaml
tasks:
  - key: align-lightbox-close
    title: 'Move the lightbox close to the top-end corner'
    description: >-
      In PhotoLightbox, move the Close preview IconButton from left: 16
      (top-start) to the trailing top-end edge (insetInlineEnd or right).
      Change position only: keep size, colour, shadow, and the Close preview
      label. Keep the control tappable with safe-area inset on the top and
      trailing edges; extra top offset is allowed only to clear App chrome,
      not to keep it on the start side. Do not edit FieldWrapper unless its
      Close control is no longer top-end. Take Photo and Quick Share must
      inherit the new corner through the shared component. Add @faims3/forms
      vitest for helper Close on the trailing title edge, lightbox Close
      preview on top-end not left, helper image zoom that returns to the
      helper after Close preview, labelled dismiss, and existing Escape /
      backdrop / pan-then-release behaviour. Touch only the forms close
      position and its tests.
    depends_on: []
    files_hint:
      - library/forms/lib/components/PhotoLightbox.tsx
      - library/forms/lib/fieldRegistry/fields/wrappers/FieldWrapper.tsx
      - library/forms/lib/fieldRegistry/fields/wrappers/FieldWrapper.test.tsx
    acceptance:
      - 1
      - 2
      - 3
      - 4
      - 5
      - 6
      - 7
      - 8
    risk: low
    size: s
    tier: cheap
```
