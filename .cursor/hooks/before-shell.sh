#!/bin/sh
# Fail closed. Parse the hook JSON with Python (not greedy sed) and only
# inspect the `command` field. A non-zero exit or a deny decision blocks.
exec python3 -c '
import json, re, shlex, sys

def deny(reason):
    json.dump(
        {
            "permission": "deny",
            "user_message": reason,
            "agent_message": reason,
        },
        sys.stdout,
    )
    sys.stdout.write("\n")
    raise SystemExit(0)

def allow():
    json.dump({"permission": "allow"}, sys.stdout)
    sys.stdout.write("\n")
    raise SystemExit(0)

raw = sys.stdin.read()
try:
    data = json.loads(raw) if raw.strip() else {}
except json.JSONDecodeError:
    deny("hook input was not valid JSON")

if not isinstance(data, dict):
    deny("hook input was not a JSON object")

command = data.get("command") or ""
if not isinstance(command, str):
    command = str(command)


def shell_segments(cmd):
    # Do not split on newlines: hook commands often include heredoc commit
    # messages, and a message line like "git push -f" is not a command.
    return [seg.strip() for seg in re.split(r"&&|\|\||;", cmd) if seg.strip()]


def tokenize(segment):
    try:
        return shlex.split(segment, posix=True)
    except ValueError:
        return segment.split()


def git_push_options(tokens):
    """Yield option tokens from each git push invocation in tokens."""
    i = 0
    while i < len(tokens):
        name = tokens[i].rsplit("/", 1)[-1]
        i += 1
        if name != "git":
            continue
        while i < len(tokens) and tokens[i].startswith("-"):
            opt = tokens[i]
            if opt in ("-C", "-c", "--git-dir", "--work-tree", "--namespace"):
                i += 2
                continue
            i += 1
        if i >= len(tokens) or tokens[i] != "push":
            continue
        i += 1
        while i < len(tokens):
            tok = tokens[i]
            i += 1
            if tok == "--":
                break
            if tok.startswith("-"):
                yield tok


def is_force_push_option(tok):
    if tok == "--force" or tok == "-f":
        return True
    return tok.startswith("-") and not tok.startswith("--") and "f" in tok[1:]


def is_git_force_push(cmd):
    for segment in shell_segments(cmd):
        if any(is_force_push_option(tok) for tok in git_push_options(tokenize(segment))):
            return True
    return False


def is_recursive_delete(cmd):
    for segment in shell_segments(cmd):
        tokens = tokenize(segment)
        for i, tok in enumerate(tokens):
            if tok.rsplit("/", 1)[-1] != "rm":
                continue
            for opt in tokens[i + 1 :]:
                if opt == "--":
                    break
                if opt in ("-r", "-R", "--recursive"):
                    return True
                if opt.startswith("-") and not opt.startswith("--") and ("r" in opt[1:] or "R" in opt[1:]):
                    return True
    return False


def is_pipe_to_shell(cmd):
    for pipeline in re.split(r"&&|\|\||;", cmd):
        parts = [p.strip() for p in pipeline.split("|")]
        if len(parts) < 2:
            continue
        for left, right in zip(parts, parts[1:]):
            left_toks = tokenize(left)
            right_toks = tokenize(right)
            if not left_toks or not right_toks:
                continue
            left_cmd = left_toks[0].rsplit("/", 1)[-1]
            right_cmd = right_toks[0].rsplit("/", 1)[-1]
            if left_cmd in ("curl", "wget") and right_cmd in ("sh", "bash"):
                return True
    return False


def is_infra_destroy(cmd):
    for segment in shell_segments(cmd):
        tokens = tokenize(segment)
        if not tokens:
            continue
        name = tokens[0].rsplit("/", 1)[-1]
        if name in ("terraform", "pulumi") and "destroy" in tokens[1:]:
            return True
        if name == "kubectl" and "delete" in tokens[1:]:
            return True
    return False


if is_git_force_push(command):
    deny("force push is blocked")
if is_recursive_delete(command):
    deny("recursive delete is blocked")
if is_pipe_to_shell(command):
    deny("pipe-to-shell install is blocked")
if is_infra_destroy(command):
    deny("infrastructure destroy is blocked")
allow()
'
