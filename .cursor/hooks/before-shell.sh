#!/bin/sh
# Fail closed. A non-zero exit or a deny decision blocks the shell command.
input=$(cat)
command=$(printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p')

deny() {
  reason=$1
  printf '{"continue":false,"permission":"deny","userMessage":"%s","agentMessage":"%s"}\n' "$reason" "$reason"
  exit 0
}

printf '%s' "$command" | grep -Eq '(git[[:space:]]+push[[:space:]].*(--force|-f)|git[[:space:]]+push[[:space:]]+-f([[:space:]]|$))' && deny "force push is blocked"
printf '%s' "$command" | grep -Eq 'rm[[:space:]]+-[a-zA-Z]*r' && deny "recursive delete is blocked"
printf '%s' "$command" | grep -Eq '(curl|wget)[[:space:]].*\|[[:space:]]*(sh|bash)' && deny "pipe-to-shell install is blocked"
printf '%s' "$command" | grep -Eq '(terraform|pulumi)[[:space:]]+destroy' && deny "infrastructure destroy is blocked"
printf '%s' "$command" | grep -Eq 'kubectl[[:space:]]+delete' && deny "kubectl delete is blocked"

printf '%s\n' '{"continue":true,"permission":"allow"}'
exit 0
