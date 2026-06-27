# Plano de testes - Raízes do Nordeste

Cenários de smoke test da API que cobrem o fluxo crítico (login, pedido, pagamento,
estoque, fidelidade) e os principais erros de borda. Cada cenário tem um request
correspondente na coleção Postman `Raizes do Nordeste - Smoke Tests` (pastas `Positivos`
e `Negativos`). A pasta `Rota A` roteiriza o fluxo crítico ponta a ponta e a pasta `Setup`
faz o login de staff.

A coleção versionada está em `postman/raizes-nordeste.postman_collection.json`. Importe esse
arquivo no Postman (Import) para ter os requests com os scripts de teste já embutidos; ela é
autossuficiente (usa collection variables, sem environment externo).

## Como a API responde

- Prefixo global: todas as rotas ficam sob `/api`. Base local: `http://localhost:3000/api`.
- Autenticação: JWT Bearer. `POST /api/auth/login` devolve `{ "access_token": "<jwt>", "refresh_token": "<token>" }`.
  O access token vai no header `Authorization: Bearer <token>` nas rotas protegidas. O refresh token
  pode ser trocado por um novo par em `POST /api/auth/refresh`; use `POST /api/auth/logout` para revogá-lo.
  São públicas: login, refresh, logout, `GET /api/products...` e `POST /api/payments/webhook`.
- Papéis: `ADMIN`, `MANAGER`, `ATTENDANT`, `KITCHEN`, `CUSTOMER`.
- Listagens (`GET /api/products...`, `GET /api/orders`) usam envelope paginado
  `{ data: [...], meta: {...} }`. `GET /api/inventory/:unidade` devolve um array simples.
- Erros: qualquer resposta 4xx/5xx usa o mesmo envelope:
  `{ statusCode, message, error, timestamp, path }`. O código vem da taxonomia de erros
  (`src/shared/errors/errors.type.ts`): `invalid` 422, `not-found` 404, `conflict` 409,
  `unauthorized` 401, `forbidden` 403, `unavailable` 503. Falha de validação de DTO
  (class-validator) responde 400.

## Pré-condições para rodar

1. Banco no ar, migrado e populado: `docker compose up -d --wait`, `npm run db:migrate`, `npm run db:seed`.
2. Definir `PAYMENT_WEBHOOK_SECRET=dev-webhook-secret` no `.env` (hoje ele não está lá). Sem esse
   valor o guard do webhook responde 401 em qualquer requisição. Reiniciar o servidor depois de
   adicionar.
3. O `webhookSecret` da coleção (variável de coleção, default `dev-webhook-secret`) tem que ser
   exatamente igual ao `PAYMENT_WEBHOOK_SECRET` do servidor.
4. Servidor rodando: `npm run start:dev`.
5. Rodar a coleção inteira de cima para baixo (Setup, Positivos, Negativos). `Setup` salva o
   `staffToken` e `P1` salva o `customerToken`; os demais requests dependem desses tokens e das
   collection variables encadeadas (orderId, extTransactionId, etc.).

## Dados vindos do seed

| Usuário            | Senha       | Papel    | Observação                    |
| ------------------ | ----------- | -------- | ----------------------------- |
| `customer1`        | `password4` | CUSTOMER | dono dos pedidos nos cenários |
| `davi151413`       | `password2` | ADMIN    | staff (status e estoque)      |
| `gustavojogadorps` | `password3` | MANAGER  | staff alternativo             |

IDs fixos no seed (os únicos com UUID estável, por isso são usados nos testes):

| Recurso                  | ID                                     | Detalhe                          |
| ------------------------ | -------------------------------------- | -------------------------------- |
| Unidade 1 (Rainbow)      | `e36e29da-52ae-49af-ab40-5f1e8b61c8a1` | tem cardápio e estoque           |
| Produto "Açaí Fitness"   | `cebe6acf-e54e-4842-a8ec-eda9a439ceb5` | no cardápio da unidade 1         |
| Preço de cardápio (unid. 1) | `22.30`                             | preço autoritativo do item       |

O `unitPrice` enviado no pedido tem que bater com o preço autoritativo de cardápio
(`customPrice`), senão a criação falha com 422. Por isso os cenários usam `22.30`.

## Cenários positivos

| ID  | Nome                                  | Endpoint                                                        | Pré-condição                                  | Entrada                                                                                   | Resultado esperado                                                       | Evidência (request)   |
| --- | ------------------------------------- | -------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------- |
| P1  | Login com credenciais válidas         | `POST /auth/login`                                             | `customer1` no seed                           | `{ username: customer1, password: password4 }`                                           | 200; corpo com `access_token` e `refresh_token` (ambos strings)          | Positivos/P1          |
| P2  | Criar pedido válido (canal APP)       | `POST /orders`                                                 | logado como `customer1`; Açaí no cardápio     | Bearer; `businessUnitId` unid. 1; `orderChannel=APP`; item Açaí `quantity=1` `unitPrice=22.30` | 201; `orderStatus=PENDING`; `totalAmount=22.30`; `customerId` preenchido | Positivos/P2          |
| P3  | Pagar pedido (sucesso)                | `POST /payments` + `POST /payments/webhook` + `GET /orders/:id` | pedido em PENDING (P2)                         | 1) pagamento `{orderId, method:PIX}`; 2) webhook assinado `status=APPROVED`; 3) lê pedido | pagamento 201 `PROCESSING`; webhook 200 `{received:true}`; pedido `CONFIRMED` | Positivos/P3a-c       |
| P4  | Ler pagamento do pedido               | `GET /orders/:orderId/payment`                                 | pedido pago (P3)                              | Bearer `customer1`                                                                        | 200; pagamento `status=APPROVED`; `orderId` confere                      | Positivos/P4          |
| P5  | Conta de fidelidade do cliente        | `GET /loyalty/me`                                              | conta criada no 1.º pedido (P2)               | Bearer `customer1`                                                                        | 200; `customerId` presente; `totalPoints` numérico                       | Positivos/P5          |
| P6  | Atualizar status (PENDING p/ CONFIRMED) | `POST /orders` + `PATCH /orders/:id/status`                  | staff logado (Setup)                          | cria pedido; PATCH `{ orderStatus: CONFIRMED }` com Bearer staff                          | criação 201 `PENDING`; PATCH 200 `CONFIRMED`                             | Positivos/P6a-b       |
| P7  | Listar cardápio por unidade           | `GET /products/by-business-unit/:bu`                          | unidade 1 com itens                           | sem auth (rota pública)                                                                   | 200; envelope paginado com `data` array                                  | Positivos/P7          |
| P8  | Filtrar pedidos por canal             | `GET /orders?orderChannel=APP`                                | staff logado                                  | Bearer staff                                                                              | 200; `data` array; todo item com `orderChannel=APP`                      | Positivos/P8          |
| P9  | Baixa de estoque ao criar pedido      | `GET /inventory/:bu` + `POST /orders` + `GET /inventory/:bu`  | staff lê estoque; produto com saldo           | lê saldo; cria pedido `quantity=1`; lê saldo de novo                                      | saldo final = saldo inicial menos 1                                      | Positivos/P9a-c       |

## Cenários negativos

| ID  | Nome                                  | Endpoint                          | Pré-condição                | Entrada                                                  | Resultado esperado                | Evidência (request)   |
| --- | ------------------------------------- | --------------------------------- | --------------------------- | ------------------------------------------------------- | --------------------------------- | --------------------- |
| N1  | Login com senha errada                | `POST /auth/login`                | `customer1` existe          | senha incorreta com 8+ caracteres (`senhaerrada`)       | 401                               | Negativos/N1          |
| N2  | Login com senha curta                 | `POST /auth/login`                | nenhuma                     | senha com menos de 8 caracteres (`123`)                 | 400 (validação `MinLength(8)`)    | Negativos/N2          |
| N3  | Criar pedido sem JWT                  | `POST /orders`                    | nenhuma                     | sem header `Authorization`                              | 401                               | Negativos/N3          |
| N4  | Criar pedido sem `orderChannel`       | `POST /orders`                    | logado como `customer1`     | body sem `orderChannel`                                 | 400 (canalPedido obrigatório)     | Negativos/N4          |
| N5  | Criar pedido com quantidade inválida  | `POST /orders`                    | logado como `customer1`     | item com `quantity: 0`                                  | 400 (`@Min(1)`)                   | Negativos/N5          |
| N6  | Produto inexistente no pedido         | `POST /orders`                    | logado como `customer1`     | `productId` UUID válido fora do cardápio                | 404                               | Negativos/N6          |
| N7  | Preço divergente do cardápio          | `POST /orders`                    | logado como `customer1`     | `unitPrice` diferente do `customPrice` (`1.00`)         | 422                               | Negativos/N7          |
| N8  | Estoque insuficiente                  | `POST /orders`                    | logado como `customer1`     | `quantity: 999999`, `unitPrice=22.30`                   | 422 (ver nota sobre 422 vs 409)   | Negativos/N8          |
| N9  | Customer em rota de staff             | `GET /orders`                     | logado como `customer1`     | Bearer `customer1` (rota é staff-only)                  | 403                               | Negativos/N9          |
| N10 | Pagar pedido já pago                  | `POST /payments` (2x)             | pedido novo em PENDING      | paga a mesma ordem duas vezes seguidas                  | 1.ª 201; 2.ª 422                  | Negativos/N10a-c      |
| N11 | Webhook com assinatura inválida       | `POST /payments/webhook`          | nenhuma                     | header `x-webhook-signature` inválido                   | 401                               | Negativos/N11         |
| N12 | Pagamento recusado                    | `POST /orders` + `POST /payments` + webhook `REFUSED` + `GET /orders/:id` | pedido novo em PENDING | webhook assinado `status=REFUSED`                       | webhook 200; pedido continua `PENDING` | Negativos/N12a-d  |

## Cobertura da matriz do roteiro (seção 8.3)

- a) Autenticação/autorização: login (P1), sem token 401 (N3), perfil sem permissão 403 (N9).
- b) Validação: campo obrigatório ausente (N4), formato/tipo inválido (N2 senha curta, N5 quantidade).
- c) Regras de negócio: pedido válido 201 (P2), produto inexistente 404 (N6), estoque insuficiente (N8).
- d) Pagamento mock: aprovado e status atualizado (P3), recusado e status coerente (N12).
- e) Logs/auditoria: ver nota abaixo.

São 9 cenários positivos e 12 negativos (mínimo do roteiro: 6 positivos, 4 negativos).

## Notas

- Os nomes de status do roteiro de sprint (CRIADO, EM_PREPARO, ENTREGUE) eram provisórios.
  O enum implementado é `PENDING`, `CONFIRMED`, `PREPARING`, `READY`, `DELIVERED`, `CANCELLED`.
  A máquina de estados exige `CONFIRMED` antes de `PREPARING`, então a transição válida a
  partir do estado inicial é `PENDING` para `CONFIRMED` (usada em P6). Ir de `PENDING` direto
  para `DELIVERED` é uma transição inválida e responde 422.
- Em N1 a senha incorreta precisa ter 8+ caracteres. Senha curta cai na validação do DTO e
  responde 400 (é exatamente o que N2 prova). Por isso há dois cenários de login com falha.
- Estoque insuficiente (N8) responde 422, não 409. `InsufficientStockError` é um `DomainError`
  com `kind = invalid`, e o filtro global mapeia `invalid` para 422. O roteiro pede "409 ou
  regra equivalente": adotamos 422 por coerência com a taxonomia de erros (uma operação de
  domínio inválida, não um conflito de recurso). Mesmo motivo do preço divergente (N7).
- Logs/auditoria (item 8.3e): não há endpoint de auditoria exposto. A troca de status grava
  `updatedById` no pedido (visível no response de P6 / `GET /orders/:id`) e o `GlobalErrorFilter`
  registra toda resposta 4xx/5xx no log do servidor (método, path, mensagem). A evidência é o
  log do servidor, não a coleção.
- O fluxo crítico (P1 a P3, espelhado na pasta `Rota A`) também é coberto por teste e2e
  automatizado em `test/payments.e2e-spec.ts`.
