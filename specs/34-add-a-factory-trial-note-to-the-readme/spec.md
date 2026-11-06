# Add a factory trial note to the README

Issue: [#34](https://github.com/PeterBaker0/FAIMS3/issues/34)

Proposed size: **s**. Pull-request breakdown is left to the planner.

## 1. Problem

The repository root `README.md` does not open with the factory-trial sentence requested in issue #34. The file currently begins with the line `Factory trial.` and then the `# FAIMS3` heading. Readers of the root README need that new sentence at the very top of the file.

## 2. Constraints

- Change only the repository root `README.md`.
- Add exactly one sentence, and add it at the top of the file: `Factory trial: this sentence was added by the control plane.`
- Leave every existing byte of `README.md` in place, including the current first line `Factory trial.`
- Do not edit other README files, source code, configuration, tests, workflows, or the architecture diagram.
- Do not reflow, reword, or reformat any existing content.

## 3. Acceptance criteria

1. The first line of `README.md` is exactly `Factory trial: this sentence was added by the control plane.`
2. The second line of `README.md` is empty.
3. From the third line through the end of the file, `README.md` is byte-for-byte identical to the file before this change, so the previous opening line `Factory trial.` remains and the `# FAIMS3` heading and everything after it are unchanged.
4. The change set contains `README.md` and no other file.

## 4. Out of scope

- Replacing or removing the existing `Factory trial.` line.
- Editing package READMEs, `docs/`, `CHANGELOG.md`, or `AGENTS.md`.
- Changing application, API, web, library, infrastructure, or test code.
- Changing CI, lint, license headers, or the Mermaid architecture diagram.
- Splitting the work into multiple pull requests (the planner owns that).

## 5. Test plan

1. From a clean worktree, run `head -n 2 README.md` and confirm line 1 is `Factory trial: this sentence was added by the control plane.` and line 2 is empty.
2. Run `git diff --name-only <base>...HEAD` and confirm the only path is `README.md`.
3. Run `git diff -U0 <base>...HEAD -- README.md` and confirm the only hunk is an insertion of that sentence plus one blank line at the start of the file, with no deletions and no other hunks.
4. Confirm `git diff <base>...HEAD -- . ':!README.md'` is empty.

## 6. Risk class and why

**Low.** The change is a single sentence in the root README. It does not affect runtime behavior, data, authentication, dependencies, or build configuration. Reverting it is deleting that sentence. Size is **s** because the edit is one insertion in one documentation file.

## 7. Open questions

None. The sentence text, the target file, and the placement at the top are fixed by the issue. The blank line after the sentence is specified in the acceptance criteria so the diff stays unambiguous.
