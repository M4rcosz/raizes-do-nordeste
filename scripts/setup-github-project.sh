#!/usr/bin/env bash
# ==============================================================================
# Setup GitHub Issues + Labels para o projeto Nexio
# ==============================================================================
# Pré-requisitos:
#   1. GitHub CLI instalado: https://cli.github.com/
#      - Linux:   sudo apt install gh
#      - macOS:   brew install gh
#      - Windows: winget install GitHub.cli
#   2. Autenticado: gh auth login
#   3. Estar dentro do diretório do repo (cd nexio-core) OU
#      passar --repo M4rcosz/nexio-core em cada comando
#
# Uso:
#   chmod +x setup_github_project.sh
#   ./setup_github_project.sh
#
# O script é idempotente: roda 2x sem duplicar (labels já existentes são puladas)
# ==============================================================================

set -e  # para no primeiro erro

REPO="M4rcosz/nexio-core"

echo "🏷️  Criando labels..."

# Labels de tipo
gh label create "feature"  --repo "$REPO" --color "0E8A16" --description "Nova funcionalidade"     --force
gh label create "bug"      --repo "$REPO" --color "D73A4A" --description "Correção de bug"        --force
gh label create "chore"    --repo "$REPO" --color "FEF2C0" --description "Setup, deps, config"    --force
gh label create "refactor" --repo "$REPO" --color "1D76DB" --description "Reescrita sem mudar comportamento" --force
gh label create "docs"     --repo "$REPO" --color "0075CA" --description "Documentação"           --force
gh label create "test"     --repo "$REPO" --color "BFD4F2" --description "Testes"                 --force

# Labels de sprint
for i in 1 2 3 4 5 6 7 8; do
  gh label create "sprint-$i" --repo "$REPO" --color "5319E7" --description "Sprint $i" --force
done

# Labels de prioridade (MoSCoW)
gh label create "must-have"   --repo "$REPO" --color "B60205" --description "Obrigatório para entrega" --force
gh label create "should-have" --repo "$REPO" --color "D93F0B" --description "Importante mas cortável" --force
gh label create "could-have"  --repo "$REPO" --color "FBCA04" --description "Desejável se sobrar tempo" --force

# Label especial pro marco crítico
gh label create "milestone"   --repo "$REPO" --color "000000" --description "Marco bloqueante" --force

echo "✅ Labels criadas"
echo ""
echo "📋 Criando issues..."

# ==============================================================================
# Função helper pra criar issue
# ==============================================================================
create_issue() {
  local title="$1"
  local body="$2"
  shift 2
  local labels=$(IFS=,; echo "$*")

  gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --body "$body" \
    --label "$labels"
}

# ==============================================================================
# SPRINT 1 — Fundação de Segurança (04/05 – 10/05)
# ==============================================================================

create_issue \
  "[RN-1] Bugfix: hash argon2 nas senhas do seed.ts" \
  "## Contexto
\`prisma/seed.ts\` grava senha em texto puro no campo \`password_hash\`:
\`\`\`ts
password_hash: 'pass1'  // ❌ texto puro
\`\`\`
Em uma avaliação que pontua LGPD em 15 pontos, isso é falha grave.

## Tarefa
- Instalar \`argon2\`
- Usar \`argon2.hash(plain, { type: argon2.argon2id })\` antes de gravar
- Verificar no DB que valor começa com \`\$argon2id\$\`

## DoD
- [ ] \`npm run seed\` executa sem erro
- [ ] Query \`SELECT password_hash FROM users\` retorna hashes argon2id
- [ ] Login funciona com senhas originais (\`pass1\`, \`pass2\`)

**Story points:** 1" \
  "bug" "sprint-1" "must-have"

create_issue \
  "[RN-2] Bugfix: enum OrderChannel COUNTER → BALCAO" \
  "## Contexto
Schema usa \`OrderChannel.COUNTER\` mas o PDF do roteiro pede literalmente \`BALCAO\`.

## Tarefa
- Editar \`prisma/schema.prisma\`: trocar valor do enum
- Criar migration: \`npx prisma migrate dev --name fix_orderchannel_balcao\`
- Atualizar seed se referenciar o valor antigo

## DoD
- [ ] Migration aplicada sem erro
- [ ] Query no DB lista \`BALCAO\` no enum
- [ ] CI verde

**Story points:** 1" \
  "bug" "sprint-1" "must-have"

create_issue \
  "[RN-3] Refactor: nomes Prisma plural → singular" \
  "## Contexto
Models estão como \`Users\`, \`Products\`, \`Orders\`. Convenção Prisma é singular.

## Tarefa
- Renomear todos os 14 models pra singular
- Manter \`@@map(\"users\")\` pra preservar nome da tabela no DB
- Ajustar imports e referências no código
- Migration: \`npx prisma migrate dev --name rename_models_singular\`

## DoD
- [ ] Build TypeScript sem erro
- [ ] Tests passando
- [ ] DB sem alteração de schema (só renomeação no client)

**Story points:** 2" \
  "refactor" "sprint-1" "must-have"

create_issue \
  "[RN-4] Setup: instalar deps de Auth + validação" \
  "## Tarefa
\`\`\`bash
npm i @nestjs/jwt @nestjs/passport passport passport-jwt argon2 class-validator class-transformer
npm i -D @types/passport-jwt
\`\`\`

## DoD
- [ ] \`package.json\` atualizado e commitado
- [ ] \`package-lock.json\` commitado
- [ ] \`npm ci\` em pasta limpa funciona

**Story points:** 1" \
  "chore" "sprint-1" "must-have"

create_issue \
  "[RN-5] Implementar AuthModule com POST /auth/login" \
  "## Tarefa
- Criar \`src/modules/auth/\`:
  - \`auth.module.ts\`
  - \`auth.controller.ts\` com \`POST /auth/login\`
  - \`auth.service.ts\` com \`validateUser\` + \`login\`
  - DTO \`LoginDto\` com \`@IsEmail\`, \`@IsString\`
- Service deve usar \`argon2.verify\` na senha
- Retornar \`{ access_token: string }\` assinado com JWT

## DoD
- [ ] \`POST /auth/login\` com creds válidas retorna 200 + token
- [ ] Creds erradas retorna 401
- [ ] Payload sem email retorna 400 com mensagem do class-validator
- [ ] Token decodificado tem \`sub\` (userId) e \`role\`

**Story points:** 3" \
  "feature" "sprint-1" "must-have"

create_issue \
  "[RN-6] JwtStrategy + guard global + decorator @Public()" \
  "## Tarefa
- Criar \`JwtStrategy\` extends \`PassportStrategy(Strategy)\`
- Registrar como guard global em \`AppModule\` via \`APP_GUARD\`
- Criar decorator \`@Public()\` (usar \`SetMetadata\`) pra liberar endpoints
- \`/auth/login\` e \`/products\` (GET) devem ter \`@Public()\`

## DoD
- [ ] \`GET /products\` funciona sem token
- [ ] Endpoint protegido sem token retorna 401
- [ ] Endpoint protegido com token expirado retorna 401
- [ ] \`req.user\` populado com payload do JWT

**Story points:** 3" \
  "feature" "sprint-1" "must-have"

create_issue \
  "[RN-7] Decorator @Roles() + RolesGuard" \
  "## Tarefa
- Criar enum \`Role\` (ADMIN, OPERADOR, CLIENTE)
- Decorator \`@Roles(Role.ADMIN)\`
- \`RolesGuard\` que lê metadata e compara com \`req.user.role\`

## DoD
- [ ] Endpoint com \`@Roles(Role.ADMIN)\` rejeita user CLIENTE com 403
- [ ] Endpoint sem \`@Roles\` aceita qualquer role autenticado
- [ ] Combinação \`@Roles(Role.ADMIN, Role.OPERADOR)\` funciona

**Story points:** 2" \
  "feature" "sprint-1" "must-have"

# ==============================================================================
# SPRINT 2 — Fundação Transversal (11/05 – 17/05)
# ==============================================================================

create_issue \
  "[RN-8] GlobalExceptionFilter com formato JSON padrão" \
  "## Tarefa
- Criar \`src/common/filters/global-exception.filter.ts\`
- Captura \`HttpException\` e \`Error\` genérico
- Formato resposta:
\`\`\`json
{
  \"statusCode\": 400,
  \"message\": \"...\",
  \"error\": \"Bad Request\",
  \"timestamp\": \"2026-05-12T10:30:00.000Z\",
  \"path\": \"/orders\"
}
\`\`\`
- Registrar como \`APP_FILTER\` em \`AppModule\`

## DoD
- [ ] Erro 404 sai no formato padrão
- [ ] Erro 500 não vaza stack trace em produção
- [ ] Logs internos têm stack completo

**Story points:** 2" \
  "feature" "sprint-2" "must-have"

create_issue \
  "[RN-9] ValidationPipe global" \
  "## Tarefa
Em \`main.ts\`:
\`\`\`ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
}));
\`\`\`

## DoD
- [ ] Payload com campo extra retorna 400
- [ ] Payload com tipo errado retorna 400 (string em campo number)
- [ ] DTOs anotados com decorators de class-validator

**Story points:** 1" \
  "feature" "sprint-2" "must-have"

create_issue \
  "[RN-10] Setup @nestjs/swagger + endpoint /api/docs" \
  "## Tarefa
- \`npm i @nestjs/swagger\`
- Configurar em \`main.ts\` com \`DocumentBuilder\`
- Adicionar \`addBearerAuth()\`
- Servir em \`/api/docs\`

## DoD
- [ ] \`http://localhost:3000/api/docs\` abre Swagger UI
- [ ] Botão \"Authorize\" aceita Bearer token
- [ ] Endpoints aparecem agrupados por tag

**Story points:** 2" \
  "feature" "sprint-2" "must-have"

create_issue \
  "[RN-11] Anotar ProductsController com Swagger" \
  "## Tarefa
- \`@ApiTags('products')\` no controller
- \`@ApiOperation\`, \`@ApiResponse\` em cada endpoint
- DTOs com \`@ApiProperty({ example: ... })\`

## DoD
- [ ] Swagger mostra schema dos DTOs
- [ ] Exemplos populados no \"Try it out\"

**Story points:** 2" \
  "docs" "sprint-2" "must-have"

create_issue \
  "[RN-12] AuditService + tabela audit_log" \
  "## Tarefa
- Criar model Prisma \`AuditLog\` (id, userId, action, entity, entityId, metadata Json, createdAt)
- Migration
- \`AuditService.log({ userId, action, entity, entityId, metadata })\`
- Injetar em use-cases sensíveis (login, criar pedido, mudar status)

## DoD
- [ ] Login bem-sucedido cria entry \`LOGIN_SUCCESS\`
- [ ] Login falho cria entry \`LOGIN_FAILED\`
- [ ] Metadata NÃO contém senha, token nem CPF

**Story points:** 3" \
  "feature" "sprint-2" "should-have"

create_issue \
  "[RN-13] Reescrever README" \
  "## Contexto
README atual descreve módulos que não existem (\`auth/\`, \`AuditService\`, decorators \`@Roles\`).

## Tarefa
- Remover tudo aspiracional
- Documentar SÓ o que está implementado no momento do PR
- Adicionar seção \"Como rodar\" com docker-compose
- Adicionar seção \"Stack\"
- Adicionar link pro \`/api/docs\`

## DoD
- [ ] README reflete fielmente o código
- [ ] Comandos copiados do README funcionam em pasta limpa

**Story points:** 1" \
  "docs" "sprint-2" "must-have"

# ==============================================================================
# SPRINT 3 — Module Orders (18/05 – 24/05)
# ==============================================================================

create_issue \
  "[RN-14] DTOs do módulo Orders" \
  "## Tarefa
- \`CreateOrderDto\`: items (array), canalPedido (enum, obrigatório), unidadeId, observacao
- \`UpdateOrderStatusDto\`: novoStatus
- \`ListOrdersQueryDto\`: canalPedido?, status?, unidadeId?, page?, limit?

## DoD
- [ ] Todos com \`@ApiProperty\` e validators
- [ ] Payload sem \`canalPedido\` rejeitado com 400

**Story points:** 2" \
  "feature" "sprint-3" "must-have"

create_issue \
  "[RN-15] OrderRepository (interface + Prisma impl)" \
  "## Tarefa
- Interface \`OrderRepository\` com create, findById, findMany, updateStatus
- \`PrismaOrderRepository\` injetável
- Symbol \`ORDER_REPOSITORY\` pra DI

## DoD
- [ ] Interface não depende de Prisma
- [ ] Impl usa \`prisma.order.\$transaction\` onde necessário

**Story points:** 2" \
  "feature" "sprint-3" "must-have"

create_issue \
  "[RN-16] Use-case CreateOrder" \
  "## Tarefa
- Valida que produtos existem e estão ativos
- Valida \`canalPedido\` informado
- Calcula \`total\` somando \`(quantidade * precoUnitario)\` dos itens
- Cria Order + OrderItems em transação Prisma
- Status inicial: \`CRIADO\`
- Loga em audit

## DoD
- [ ] Pedido válido retorna 201 com id
- [ ] Produto inexistente retorna 404
- [ ] Produto inativo retorna 422
- [ ] Sem \`canalPedido\` retorna 400

**Story points:** 3" \
  "feature" "sprint-3" "must-have"

create_issue \
  "[RN-17] Use-case UpdateOrderStatus + máquina de estados" \
  "## Tarefa
Estados válidos:
- CRIADO → EM_PREPARO, CANCELADO
- EM_PREPARO → PRONTO, CANCELADO
- PRONTO → ENTREGUE
- ENTREGUE → (terminal)
- CANCELADO → (terminal)

Implementar como Map ou objeto de transições válidas. Rejeitar transição inválida com 422.

## DoD
- [ ] CRIADO → ENTREGUE direto rejeitado
- [ ] ENTREGUE → qualquer rejeitado
- [ ] Audit log registra cada transição

**Story points:** 3" \
  "feature" "sprint-3" "must-have"

create_issue \
  "[RN-18] Use-cases FindOrderById e ListOrdersByUnit" \
  "## Tarefa
- \`FindOrderById\`: retorna 404 se não existir
- \`ListOrdersByUnit\`: aceita filtros via DTO, paginação
- Filtro \`canalPedido\` via query param funcional

## DoD
- [ ] \`GET /orders?canalPedido=APP\` retorna só pedidos APP
- [ ] Paginação funciona (page=2&limit=10)

**Story points:** 2" \
  "feature" "sprint-3" "must-have"

create_issue \
  "[RN-19] OrdersController REST + Swagger" \
  "## Tarefa
Endpoints:
- POST /orders (auth: CLIENTE+)
- GET /orders/:id (auth: dono ou OPERADOR+)
- GET /orders (auth: OPERADOR+)
- PATCH /orders/:id/status (auth: OPERADOR+)

Anotar tudo com \`@ApiTags\`, \`@ApiBearerAuth\`, \`@ApiResponse\`.

## DoD
- [ ] Swagger documenta todos endpoints com schemas
- [ ] CLIENTE não consegue ver pedido de outro CLIENTE

**Story points:** 1" \
  "feature" "sprint-3" "must-have"

create_issue \
  "[RN-20] Specs unitários dos use-cases de Orders" \
  "## Tarefa
Mínimo 4 specs:
- CreateOrder: caminho feliz + erro produto inexistente
- UpdateOrderStatus: transição válida + transição inválida

## DoD
- [ ] \`npm test\` verde
- [ ] Coverage do módulo Orders >= 70%

**Story points:** 2" \
  "test" "sprint-3" "must-have"

# ==============================================================================
# SPRINT 4 — Module Payments (25/05 – 31/05) 🎯 MARCO
# ==============================================================================

create_issue \
  "[RN-21] MockPaymentGateway" \
  "## Tarefa
Classe \`MockPaymentGateway\` com método \`charge(amount, metadata)\` que:
- Retorna sucesso se valor != 13.13 (regra de teste)
- Retorna falha caso contrário
- Simula latência de 200ms

## DoD
- [ ] Injetável via DI
- [ ] Spec com 2 cenários (sucesso e falha)

**Story points:** 2" \
  "feature" "sprint-4" "must-have"

create_issue \
  "[RN-22] Use-case CreatePayment" \
  "## Tarefa
- Recebe orderId
- Busca Order, valida que está em CRIADO
- Chama \`MockPaymentGateway.charge(order.total)\`
- Salva Payment com status PENDENTE / APROVADO / REJEITADO
- Audit log

## DoD
- [ ] Pagamento de pedido inexistente: 404
- [ ] Pagamento de pedido já pago: 422
- [ ] Sucesso retorna 201 com id do payment

**Story points:** 3" \
  "feature" "sprint-4" "must-have"

create_issue \
  "[RN-23] Endpoint POST /payments/webhook" \
  "## Tarefa
- Recebe payload do gateway (mock simula chamada)
- Valida assinatura (mock: header secreto fixo no .env)
- Atualiza Payment.status conforme resultado

## DoD
- [ ] Webhook sem header secreto retorna 401
- [ ] Webhook com payment inexistente retorna 404
- [ ] Webhook bem-sucedido atualiza status

**Story points:** 3" \
  "feature" "sprint-4" "must-have"

create_issue \
  "[RN-24] Hook: pagamento aprovado → Order.status = EM_PREPARO" \
  "## Tarefa
- No webhook (ou no CreatePayment), após APROVADO, chamar \`UpdateOrderStatus\` com EM_PREPARO
- Tudo numa transação Prisma

## DoD
- [ ] Após pagamento aprovado, GET /orders/:id mostra status EM_PREPARO
- [ ] Audit log tem 2 entries (PAYMENT_APPROVED, ORDER_STATUS_CHANGED)

**Story points:** 2" \
  "feature" "sprint-4" "must-have"

create_issue \
  "[RN-25] Use-case FindPaymentByOrder" \
  "## Tarefa
- GET /orders/:id/payment retorna Payment vinculado
- 404 se pedido não tem pagamento ainda

## DoD
- [ ] Funciona end-to-end via Postman

**Story points:** 1" \
  "feature" "sprint-4" "must-have"

create_issue \
  "[RN-26] Specs unitários de Payments" \
  "## Tarefa
Mínimo 3 specs cobrindo CreatePayment (sucesso, pedido inexistente, pedido já pago).

## DoD
- [ ] \`npm test\` verde
- [ ] Coverage do módulo Payments >= 70%

**Story points:** 2" \
  "test" "sprint-4" "must-have"

create_issue \
  "🎯 [MARCO] Smoke test fluxo crítico A — fim S4" \
  "## Critério bloqueante (31/05)
Rodar em sequência via Postman:
1. POST /auth/login → recebe token
2. POST /orders (canalPedido=APP) → status CRIADO
3. POST /payments (orderId) → status APROVADO
4. POST /payments/webhook → confirma
5. GET /orders/:id → status EM_PREPARO

## DoD
- [ ] Todos 5 requests retornam 2xx
- [ ] Audit log tem entries esperadas
- [ ] **Se falhar: PARAR e replanejar antes de S5**

**Story points:** -" \
  "milestone" "sprint-4" "must-have"

# ==============================================================================
# SPRINT 5 — Inventory + Loyalty (01/06 – 07/06)
# ==============================================================================

create_issue \
  "[RN-27] InventoryModule básico" \
  "## Tarefa
- GET /inventory/:unidadeId
- POST /inventory/:unidadeId/adjust (entrada ou saída manual)
- Auth: OPERADOR+

## DoD
- [ ] Ajuste manual atualiza StockMovement
- [ ] Saldo refletido em Inventory.quantidade

**Story points:** 3" \
  "feature" "sprint-5" "should-have"

create_issue \
  "[RN-28] Hook: CreateOrder → baixa estoque" \
  "## Tarefa
- Dentro da transação do CreateOrder, decrementar Inventory.quantidade pra cada item
- Se algum produto sem estoque suficiente, abortar transação com 422

## DoD
- [ ] Pedido com produto fora de estoque retorna 422
- [ ] Pedido criado decrementa estoque corretamente
- [ ] Rollback funciona (se item 3 falha, items 1 e 2 não baixam)

**Story points:** 3" \
  "feature" "sprint-5" "should-have"

create_issue \
  "[RN-29] Validação minQuantity → STOCK_ALERT no audit" \
  "## Tarefa
- Após baixa, se Inventory.quantidade <= minQuantity, criar audit log com action=STOCK_ALERT
- Metadata com unidadeId, produtoId, quantidadeAtual, minQuantity

## DoD
- [ ] Alert disparado nos casos certos
- [ ] Não dispara se quantidade > minQuantity

**Story points:** 1" \
  "feature" "sprint-5" "should-have"

create_issue \
  "[RN-30] LoyaltyModule: criar conta no primeiro pedido" \
  "## Tarefa
- Hook após CreateOrder: se cliente não tem LoyaltyAccount, criar com saldo 0
- GET /loyalty/me retorna conta do usuário autenticado

## DoD
- [ ] Primeiro pedido cria conta automaticamente
- [ ] Pedidos seguintes não duplicam conta

**Story points:** 2" \
  "feature" "sprint-5" "should-have"

create_issue \
  "[RN-31] Hook: pagamento aprovado → +pontos via LoyaltyTransaction" \
  "## Tarefa
- Regra: 1 ponto a cada R\$10 do total (floor)
- Criar LoyaltyTransaction (type=EARN, points)
- Atualizar saldo da LoyaltyAccount

## DoD
- [ ] Pedido de R\$25 aprovado → +2 pontos
- [ ] Pedido cancelado não gera pontos
- [ ] Tudo em transação atômica

**Story points:** 2" \
  "feature" "sprint-5" "should-have"

# ==============================================================================
# SPRINT 6 — Testes + Postman (08/06 – 14/06)
# ==============================================================================

create_issue \
  "[RN-32] Documento TESTS.md com tabela de cenários" \
  "## Tarefa
Tabela markdown com colunas: ID, Nome, Tipo (positivo/negativo), Pré-condição, Passos, Resultado esperado.

## DoD
- [ ] Arquivo \`docs/TESTS.md\` no repo
- [ ] Referenciado no PDF final

**Story points:** 2" \
  "docs" "sprint-6" "must-have"

create_issue \
  "[RN-33] 6 cenários positivos documentados" \
  "## Cenários
1. Login com creds válidas
2. Criar pedido válido (canalPedido=APP)
3. Pagar pedido (sucesso)
4. Atualizar status (CRIADO → EM_PREPARO)
5. Listar cardápio por unidade
6. Decrementar estoque ao criar pedido

## DoD
- [ ] Todos no TESTS.md
- [ ] Cada um com request Postman correspondente

**Story points:** 2" \
  "test" "sprint-6" "must-have"

create_issue \
  "[RN-34] 4 cenários negativos documentados" \
  "## Cenários
1. Login com senha errada → 401
2. Criar pedido sem JWT → 401
3. Adicionar produto inexistente ao pedido → 404
4. Pagar pedido já pago → 422 (ou transição CRIADO→ENTREGUE direto)

## DoD
- [ ] Todos no TESTS.md
- [ ] Cada um com request Postman correspondente

**Story points:** 2" \
  "test" "sprint-6" "must-have"

create_issue \
  "[RN-35] Coleção Postman com env vars + scripts de teste" \
  "## Tarefa
- Coleção \`nexio-core.postman_collection.json\` no repo
- Environment com \`baseUrl\`, \`token\`
- Script de teste em cada request (\`pm.test('status 200', ...)\`)
- Login salva token automaticamente em env

## DoD
- [ ] \`newman run colecao.json -e env.json\` passa 100%
- [ ] Coleção commitada no repo

**Story points:** 3" \
  "test" "sprint-6" "must-have"

create_issue \
  "[RN-36] Teste e2e em Jest do fluxo crítico A" \
  "## Tarefa
- \`test/order-flow.e2e-spec.ts\`
- Sobe app NestJS de teste, banco em memória ou test container
- Fluxo: cria user → login → cria pedido → paga → confirma webhook → checa status

## DoD
- [ ] \`npm run test:e2e\` verde
- [ ] Roda no CI

**Story points:** 1" \
  "test" "sprint-6" "must-have"

# ==============================================================================
# SPRINT 7 — Documentação (15/06 – 21/06)
# ==============================================================================

create_issue \
  "[RN-37] DER refeito por você" \
  "## ⚠️ Importante
Refazer com seu raciocínio (PDF do roteiro veta IA gerar solução). Use referência conceitual só pra entender domínio, não copie.

## Tarefa
- Ferramenta: dbdiagram.io, drawio ou Lucid
- Exportar PNG + fonte editável
- Incluir todas 14 entidades + cardinalidades

## DoD
- [ ] Imagem inserida no PDF
- [ ] Fonte commitada em \`docs/diagrams/\`

**Story points:** 2" \
  "docs" "sprint-7" "must-have"

create_issue \
  "[RN-38] Diagrama de classes" \
  "## Tarefa
- UML de classes das entidades de domínio
- Atributos + métodos principais (não precisa todos)
- Heranças e composições

## DoD
- [ ] Imagem no PDF
- [ ] Fonte commitada

**Story points:** 2" \
  "docs" "sprint-7" "must-have"

create_issue \
  "[RN-39] Diagrama de casos de uso" \
  "## Tarefa
- Atores: Cliente, Operador, Admin
- UCs principais: UC1 Criar pedido, UC2 Pagar pedido, UC3 Atualizar status, UC4 Consultar fidelidade, UC5 Ajustar estoque, etc.
- Cada UC com descrição (objetivo, ator, fluxo principal, fluxos alternativos)

## DoD
- [ ] Diagrama no PDF
- [ ] Descrições textuais dos UCs no PDF

**Story points:** 3" \
  "docs" "sprint-7" "must-have"

create_issue \
  "[RN-40] Revisar Swagger: descrições, exemplos, response codes" \
  "## Tarefa
Pasada final no Swagger:
- Cada endpoint com descrição clara
- \`@ApiResponse\` pra cada status code
- Exemplos populados nos DTOs

## DoD
- [ ] Swagger renderiza sem warnings
- [ ] Print do Swagger anexado ao PDF

**Story points:** 1" \
  "docs" "sprint-7" "must-have"

create_issue \
  "[RN-41] PDF ABNT v1 completo" \
  "## Tarefa
Estrutura:
- Capa
- Sumário
- Introdução
- Análise de Requisitos
- Modelagem (DER, classes, casos de uso)
- Arquitetura (camadas, decisões técnicas)
- Implementação (stack, módulos)
- Segurança e LGPD
- Plano de Testes
- Conclusão
- Referências (OWASP, NestJS docs, Prisma docs, etc.)

Formato: Times/Arial 12, 1.5 espaçamento, margens ABNT.

## DoD
- [ ] PDF >= 20 páginas
- [ ] Citações no formato ABNT
- [ ] Imagens com legenda numerada

**Story points:** 4" \
  "docs" "sprint-7" "must-have"

# ==============================================================================
# SPRINT 8 — Buffer + Entrega (22/06 – 28/06)
# ==============================================================================

create_issue \
  "[RN-42] Dockerfile multi-stage" \
  "## Tarefa
- Stage 1 (builder): node:22, instala deps, build
- Stage 2 (runner): node:22-alpine, copia só dist + node_modules de prod
- Imagem final < 200MB

## DoD
- [ ] \`docker build\` funciona
- [ ] \`docker images\` mostra tamanho < 200MB
- [ ] Container roda

**Story points:** 2" \
  "chore" "sprint-8" "should-have"

create_issue \
  "[RN-43] Audit LGPD: revisar campos sensíveis e logs" \
  "## Tarefa
- Pesquisar projeto por: \`console.log\`, \`logger.log\`
- Garantir que NENHUM loga: senha, token, cpf, hash
- Adicionar mask nos campos sensíveis se aparecer em DTOs de resposta
- Documentar minimização de dados no PDF

## DoD
- [ ] Nenhum log expõe PII/credencial
- [ ] Seção LGPD do PDF cita decisões tomadas

**Story points:** 2" \
  "chore" "sprint-8" "must-have"

create_issue \
  "[RN-44] Smoke test em pasta limpa" \
  "## ⚠️ Crítico — link quebrado = nota zero em Entrega

## Tarefa
- \`git clone\` em pasta nova
- \`docker-compose up\`
- \`newman run colecao.json -e env.json\`
- Tudo verde sem ajuste manual

## DoD
- [ ] Funciona do zero sem ler README
- [ ] Funciona seguindo só README

**Story points:** 1" \
  "test" "sprint-8" "must-have"

create_issue \
  "[RN-45] Verificar todos os links do PDF" \
  "## Tarefa
- Link do GitHub repo: testar incognito
- Link do Swagger (se hospedado)
- Link da coleção Postman (se hospedada)
- Cada link no PDF, abrir um por um

## DoD
- [ ] Todos abrem em janela anônima
- [ ] Repo está público

**Story points:** 1" \
  "chore" "sprint-8" "must-have"

create_issue \
  "[RN-46] Tag de release v1.0.0" \
  "## Tarefa
\`\`\`bash
git tag -a v1.0.0 -m \"Entrega final UNINTER 2026\"
git push origin v1.0.0
\`\`\`

## DoD
- [ ] Tag visível em github.com/M4rcosz/nexio-core/releases

**Story points:** 1" \
  "chore" "sprint-8" "must-have"

create_issue \
  "[RN-47] Revisão do PDF por terceiro" \
  "## Tarefa
Pedir pra alguém (família, amigo, colega de curso) ler o PDF buscando:
- Typos
- Frases confusas
- Imagens cortadas

## DoD
- [ ] Feedback recebido e aplicado

**Story points:** 1" \
  "docs" "sprint-8" "must-have"

echo ""
echo "✅ 47 issues criadas com sucesso!"
echo ""
echo "📌 Próximos passos manuais (1 vez só):"
echo "1. Acesse: https://github.com/$REPO/projects"
echo "2. Clique em 'New project' → Template 'Team planning'"
echo "3. Conecte o repo $REPO"
echo "4. Em 'Settings → Manage iterations', crie 8 iterations:"
echo "   - Sprint 1: 04/05 - 10/05"
echo "   - Sprint 2: 11/05 - 17/05"
echo "   - Sprint 3: 18/05 - 24/05"
echo "   - Sprint 4: 25/05 - 31/05"
echo "   - Sprint 5: 01/06 - 07/06"
echo "   - Sprint 6: 08/06 - 14/06"
echo "   - Sprint 7: 15/06 - 21/06"
echo "   - Sprint 8: 22/06 - 28/06"
echo "5. Adicione todas as issues do repo ao project"
echo "6. Filtre por label 'sprint-1' e atribua à iteration Sprint 1 (idem pras outras)"
echo "7. Configure view 'Board' agrupada por status: Backlog | Todo | In Progress | Review | Done"
echo ""
echo "🎯 Próxima ação: comece pela RN-1 (argon2 no seed)"
