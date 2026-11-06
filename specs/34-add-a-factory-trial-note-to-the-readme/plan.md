# Plan 🎉

One tiny pull request. Size **s**, risk **low**. Let's pin a sentence to the top of the README. 📌

```yaml
tasks:
  - key: add-readme-note
    title: '🎉 Pin the factory trial sentence to the README'
    description: >-
      ✨ Drop "Factory trial: this sentence was added by the control plane."
      onto line 1 of the root README.md and leave line 2 as a cheerful blank. 📝
      Keep every existing byte after that, including the current "Factory trial."
      line. 🛡️ Touch no other file. ✅ Check with head -n 2 and a diff that
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
    tier: cheap
```
