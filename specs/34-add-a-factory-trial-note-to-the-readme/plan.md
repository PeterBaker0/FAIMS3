# Plan

One pull request. Size **s**, risk **low**.

```yaml
tasks:
  - key: add-readme-note
    title: Add the factory trial sentence to the README
    description: >-
      Insert "Factory trial: this sentence was added by the control plane."
      as line 1 of the root README.md and leave line 2 blank. Keep every
      existing byte after that, including the current "Factory trial." line.
      Do not change any other file. Check with head -n 2 and a diff that
      shows only a top-of-file insertion in README.md.
    depends_on: []
    files_hint:
      - README.md
    acceptance:
      - 1
      - 2
      - 3
      - 4
    risk: low
    size: s
    tier: 1
```
