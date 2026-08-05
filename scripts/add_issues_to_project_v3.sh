#!/usr/bin/env bash
# ==============================================================================
# v3 — usa GraphQL direto pra buscar iterations (CLI não expõe esse dado)
# ==============================================================================

set -e

OWNER="M4rcosz"
REPO="nexio-core"
PROJECT_NUMBER=2

# ==============================================================================

for cmd in gh jq; do
  if ! command -v "$cmd" &> /dev/null; then
    echo "❌ $cmd não instalado."
    exit 1
  fi
done

if ! gh auth status &> /dev/null; then
  echo "❌ Não autenticado. Roda: gh auth login"
  exit 1
fi

echo "🔍 Buscando IDs do Project..."

PROJECT_ID=$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json | jq -r '.id')

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "null" ]; then
  echo "❌ Project número $PROJECT_NUMBER não encontrado pra $OWNER"
  exit 1
fi

echo "✅ Project ID: $PROJECT_ID"

# Pega ID do campo Iteration
ITERATION_FIELD_ID=$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit 50 \
  | jq -r '.fields[] | select(.name=="Iteration") | .id')

if [ -z "$ITERATION_FIELD_ID" ] || [ "$ITERATION_FIELD_ID" = "null" ]; then
  echo "❌ Campo Iteration não encontrado."
  exit 1
fi

echo "✅ Iteration field ID: $ITERATION_FIELD_ID"

# ==============================================================================
# Busca iterations via GraphQL (CLI normal não retorna isso)
# ==============================================================================

echo "🔍 Buscando iterations via GraphQL..."

ITERATIONS_DATA=$(gh api graphql -f query='
{
  user(login: "'"$OWNER"'") {
    projectV2(number: '"$PROJECT_NUMBER"') {
      field(name: "Iteration") {
        ... on ProjectV2IterationField {
          configuration {
            iterations {
              id
              title
              startDate
            }
          }
        }
      }
    }
  }
}')

# Extrai a lista de iterations
ITERATIONS_LIST=$(echo "$ITERATIONS_DATA" | jq -r '.data.user.projectV2.field.configuration.iterations')

if [ "$ITERATIONS_LIST" = "null" ] || [ -z "$ITERATIONS_LIST" ]; then
  echo "❌ Nenhuma iteration encontrada via GraphQL."
  echo ""
  echo "Possíveis causas:"
  echo "  1. Você não clicou em 'Save' no navegador depois de criar as iterations"
  echo "  2. As iterations foram criadas mas estão como 'Completed' (busca apenas active)"
  echo ""
  echo "Vai em: https://github.com/users/$OWNER/projects/$PROJECT_NUMBER/settings/fields/Iteration"
  echo "Confere se aparecem 8 iterations Active."
  exit 1
fi

# Mapeia Sprint N → ID da iteration
declare -A SPRINT_IDS

echo ""
echo "📅 Iterations encontradas:"
echo "$ITERATIONS_LIST" | jq -r '.[] | "   • \(.title) (\(.startDate))"'
echo ""

for i in 1 2 3 4 5 6 7 8; do
  # Aceita "Sprint 1 - ..." ou "Sprint 1 — ..." ou "Sprint 1" puro
  ITER_ID=$(echo "$ITERATIONS_LIST" | jq -r --arg n "Sprint $i" \
    '.[] | select(.title | startswith($n + " ") or . == $n) | .id' | head -1)

  if [ -z "$ITER_ID" ] || [ "$ITER_ID" = "null" ]; then
    echo "❌ Iteration 'Sprint $i' não encontrada."
    echo "   Confere o nome exato no navegador. Esperado prefixo 'Sprint $i '."
    exit 1
  fi
  SPRINT_IDS[$i]="$ITER_ID"
  echo "✅ Sprint $i → $ITER_ID"
done

# ==============================================================================
# Adiciona issues
# ==============================================================================

echo ""
echo "📋 Buscando issues do repo $OWNER/$REPO..."

ISSUES_JSON=$(gh issue list --repo "$OWNER/$REPO" --state open --limit 100 --json number,title,labels)
TOTAL=$(echo "$ISSUES_JSON" | jq 'length')
echo "✅ $TOTAL issues encontradas"

if [ "$TOTAL" -lt 40 ]; then
  echo "⚠️  Poucas issues (esperado ~47)."
  read -p "Continuar mesmo assim? (s/N) " confirm
  [ "$confirm" != "s" ] && exit 1
fi

echo ""
echo "📌 Adicionando issues ao project..."

ADDED=0
SKIPPED=0
FAILED=0

for row in $(echo "$ISSUES_JSON" | jq -r '.[] | @base64'); do
  ISSUE=$(echo "$row" | base64 --decode)
  NUMBER=$(echo "$ISSUE" | jq -r '.number')
  TITLE=$(echo "$ISSUE" | jq -r '.title')
  SPRINT_LABEL=$(echo "$ISSUE" | jq -r '.labels[] | select(.name | startswith("sprint-")) | .name' | head -1)

  if [ -z "$SPRINT_LABEL" ]; then
    echo "⏭️  #$NUMBER sem label sprint-N → pulando"
    SKIPPED=$((SKIPPED+1))
    continue
  fi

  SPRINT_NUM="${SPRINT_LABEL#sprint-}"
  ITER_ID="${SPRINT_IDS[$SPRINT_NUM]}"

  ISSUE_URL="https://github.com/$OWNER/$REPO/issues/$NUMBER"

  ITEM_RESPONSE=$(gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$ISSUE_URL" --format json 2>&1) || {
    echo "❌ Falha ao adicionar #$NUMBER: $ITEM_RESPONSE"
    FAILED=$((FAILED+1))
    continue
  }

  ITEM_ID=$(echo "$ITEM_RESPONSE" | jq -r '.id')

  gh project item-edit \
    --id "$ITEM_ID" \
    --field-id "$ITERATION_FIELD_ID" \
    --project-id "$PROJECT_ID" \
    --iteration-id "$ITER_ID" \
    > /dev/null 2>&1 || {
    echo "⚠️  #$NUMBER adicionada mas falhou ao setar iteration"
    FAILED=$((FAILED+1))
    continue
  }

  echo "✅ #$NUMBER → Sprint $SPRINT_NUM (${TITLE:0:60})"
  ADDED=$((ADDED+1))
done

echo ""
echo "═══════════════════════════════════════"
echo "✅ Adicionadas:    $ADDED"
echo "⏭️  Puladas:        $SKIPPED"
echo "❌ Falhas:         $FAILED"
echo "═══════════════════════════════════════"
echo ""
echo "🎯 Próximo: https://github.com/users/$OWNER/projects/$PROJECT_NUMBER"
