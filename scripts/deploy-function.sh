#!/bin/bash

# Deploy one or more of this project's Supabase Edge Functions.
#
#   scripts/deploy-function.sh process-image
#   scripts/deploy-function.sh process-text get-usage
#
# The project ref is read from supabase/config.toml rather than from CLI
# state, so a fresh checkout that has never run `supabase link` deploys to
# the right project instead of failing with "Cannot find project ref".

set -euo pipefail

cd "$(dirname "$0")/.."

deployable() {
    # Everything under functions/ except the _shared module directory.
    find supabase/functions -mindepth 1 -maxdepth 1 -type d ! -name '_*' -exec basename {} \; | sort
}

if [ $# -eq 0 ]; then
    echo "Usage: $0 <function-name> [function-name ...]" >&2
    echo "" >&2
    echo "Deployable functions:" >&2
    deployable | sed 's/^/  /' >&2
    exit 1
fi

PROJECT_REF=$(sed -n 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' supabase/config.toml | head -1)
if [ -z "$PROJECT_REF" ]; then
    echo "❌ No project_id found in supabase/config.toml" >&2
    exit 1
fi

# The CLI takes either an access token in the environment or a previous
# `supabase login`. Requiring the token alone would refuse a machine that is
# perfectly able to deploy, so check that *some* credential works.
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] && ! npx supabase projects list >/dev/null 2>&1; then
    echo "❌ Not authenticated with Supabase." >&2
    echo "   Run:  npx supabase login" >&2
    echo "   Or:   export SUPABASE_ACCESS_TOKEN=your-token" >&2
    echo "         (https://supabase.com/dashboard/account/tokens)" >&2
    exit 1
fi

# Check every name before deploying any, so a typo in the second argument
# does not leave the first function already deployed.
for fn in "$@"; do
    if [ ! -d "supabase/functions/$fn" ]; then
        echo "❌ No such function: $fn" >&2
        echo "" >&2
        echo "Deployable functions:" >&2
        deployable | sed 's/^/  /' >&2
        exit 1
    fi
done

for fn in "$@"; do
    echo ""
    echo "📦 Deploying $fn to project $PROJECT_REF..."
    npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done
