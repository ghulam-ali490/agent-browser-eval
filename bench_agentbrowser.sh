#!/usr/bin/env bash
# Benchmark: agent-browser CLI on the 5-task suite (quotes.toscrape.com)
BASE="https://quotes.toscrape.com"
OUT="/c/Users/Admin/agent-browser-eval/results/agent-browser"
mkdir -p "$OUT"

task_t1() {            # navigate + extract
  agent-browser open "$BASE/"
  agent-browser snapshot
}
task_t2() {            # form fill + submit
  agent-browser open "$BASE/login"
  agent-browser snapshot -i
  agent-browser fill "#username" "test"
  agent-browser fill "#password" "test"
  agent-browser click "input[type=submit]"
  agent-browser wait 500
  agent-browser snapshot -i
}
task_t3() {            # pagination
  agent-browser open "$BASE/"
  agent-browser snapshot -i
  agent-browser click ".next a"
  agent-browser wait 500
  agent-browser snapshot
}
task_t4() {            # dynamic / JS-rendered
  agent-browser open "$BASE/js"
  agent-browser wait 700
  agent-browser snapshot
}
task_t5() {            # screenshot
  agent-browser open "$BASE/tag/love/"
  agent-browser screenshot "$OUT/t5.png" --full
}

run() {
  local label="$1" round="$2"
  local f="$OUT/${label}_r${round}.out"
  local s=$(date +%s%3N)
  "task_$label" > "$f" 2>&1
  local e=$(date +%s%3N)
  local ch=$(wc -c < "$f")
  echo "$label r$round $((e-s))ms ${ch}chars"
}

for r in 1 2 3; do
  for t in t1 t2 t3 t4 t5; do
    run "$t" "$r"
  done
done
echo "DONE"
