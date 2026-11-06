# Add a factory trial note to the README

Issue: [#34](https://github.com/PeterBaker0/FAIMS3/issues/34)

Proposed size: **s**. Pull-request breakdown is left to the planner.

## 1. Problem

Root `README.md` does not open with the sentence from issue #34. It currently starts with `Factory trial.`

## 2. Constraints

- Edit only root `README.md`.
- Insert exactly `Factory trial: this sentence was added by the control plane.` as line 1.
- Keep every existing byte, including the current `Factory trial.` line.

## 3. Acceptance criteria

1. Line 1 of `README.md` is exactly `Factory trial: this sentence was added by the control plane.`
2. Line 2 is empty.
3. From line 3 to end of file, `README.md` matches the previous contents, starting with `Factory trial.`
4. The diff contains only `README.md`.

## 4. Out of scope

Any other file, including other READMEs, source, tests, CI, changelog, and the architecture diagram. Do not remove the existing `Factory trial.` line.

## 5. Test plan

1. `head -n 2 README.md` shows the new sentence, then a blank line.
2. `git diff --name-only <base>...HEAD` lists only `README.md`.
3. `git diff -U0 <base>...HEAD -- README.md` is one top-of-file insertion and no deletions.

## 6. Risk class and why

**Low.** One README sentence. No runtime, data, or build change. Size **s**.

## 7. Open questions

None.
