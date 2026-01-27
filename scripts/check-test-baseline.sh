#!/bin/bash
# Enforce test failure baseline - see issue #7
# Pass if failures <= BASELINE_FAILURES and no new test files fail
# Fail if failures > BASELINE_FAILURES or any new test file has failures

set -e

BASELINE_FAILURES=8
BASELINE_FAILING_FILES=(
  "__tests__/api/terminal/build.test.ts"
  "__tests__/terminal/api/prop.test.ts"
)

# Run tests and capture output
echo "Running tests..."
TEST_OUTPUT=$(npm test 2>&1) || true

# Strip ANSI color codes for parsing
CLEAN_OUTPUT=$(echo "$TEST_OUTPUT" | sed 's/\x1b\[[0-9;]*m//g')

# Extract failure count from "Tests" summary line (cross-platform compatible)
# Vitest format: "Tests  8 failed | 301 passed (309)"
FAILURE_COUNT=$(echo "$CLEAN_OUTPUT" | grep 'Tests' | grep 'failed' | sed 's/.*Tests[^0-9]*//' | sed 's/ failed.*//' || echo "0")
if [ -z "$FAILURE_COUNT" ]; then
  # No failures found in output - tests passed
  FAILURE_COUNT=0
fi

echo "Test failures: $FAILURE_COUNT (baseline: $BASELINE_FAILURES)"

# Extract failing files (cross-platform compatible)
FAILING_FILES=$(echo "$CLEAN_OUTPUT" | grep 'FAIL ' | sed 's/.*FAIL //' | sed 's/ .*//' | grep '__tests__' | sort -u || true)

# Check for new failing files
NEW_FAILURES=""
for file in $FAILING_FILES; do
  IS_BASELINE=false
  for baseline_file in "${BASELINE_FAILING_FILES[@]}"; do
    if [ "$file" == "$baseline_file" ]; then
      IS_BASELINE=true
      break
    fi
  done
  if [ "$IS_BASELINE" == "false" ]; then
    NEW_FAILURES="$NEW_FAILURES $file"
  fi
done

# Report results
if [ -n "$NEW_FAILURES" ]; then
  echo "❌ NEW test file failures detected (not in baseline):"
  echo "$NEW_FAILURES"
  echo ""
  echo "These failures must be fixed before merging."
  exit 1
fi

if [ "$FAILURE_COUNT" -gt "$BASELINE_FAILURES" ]; then
  echo "❌ Failure count ($FAILURE_COUNT) exceeds baseline ($BASELINE_FAILURES)"
  echo "New tests are failing. Fix them before merging."
  exit 1
fi

if [ "$FAILURE_COUNT" -lt "$BASELINE_FAILURES" ]; then
  echo "✅ Failure count ($FAILURE_COUNT) is below baseline ($BASELINE_FAILURES)"
  echo "Some baseline issues may have been fixed!"
fi

echo "✅ Test baseline check passed"
exit 0
