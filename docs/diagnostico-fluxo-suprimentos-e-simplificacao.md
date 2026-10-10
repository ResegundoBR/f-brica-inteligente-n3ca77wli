# Diagnóstico Profundo do Fluxo de Suprimentos & Proposta de Simplificação

**Frente 2 — Análise Arquitetural, Mapeamento de Estados e Roteiro de Descomplicação**  
**Projeto:** Fábrica Inteligente (PCP & Suprimentos)  
**Data:** Outubro/2026  
**Status:** Documento de Análise & Especificação Estratégica (Sem alteração de código ou dados nesta rodada)

---

## Sumário Executivo

O módulo de Suprimentos da Fábrica Inteligente evoluiu rapidamente para absorver necessidades críticas de produção: rateio de faltas geradas no Portal do Operador, compras consolidadas em lote para economia de escala e frete, controle de excedente para estoque, cotações múltiplas de fornecedores, ordens de compra (OC) formais e conferência no recebimento com rateio entre OPs.

No entanto, o acúmulo de regras pontuais, telas paralelas (Triagem vs. Solicitações vs. Cotações) e redundâncias conceituais entre o **Cadastro Mestre de Componentes (`components`)**, o **Saldo Físico (`inventory`)** e as **Requisições de Faltas (`material_shortages`)** tornaram a operação diária pesada, confusa e propensa a cantos cegos.

O objetivo deste documento é:

1. **Mapear detalhadamente** o fluxo ponta a ponta atual (conceitos, telas, campos, serviços e hooks);
2. **Auditar a máquina de estados** de `material_shortages`, apontando transições inválidas, lacunas e a formalização necessária;
3. **Identificar os conceitos sobrepostos** que confundem o usuário e geram retrabalho;
4. **Listar as regras de integridade** que hoje vivem apenas no frontend e propor sua blindagem no servidor (`pb_hooks`);
5. **Apresentar uma proposta de simplificação** dividida em fases pequenas, independentes e ordenadas pelo índice Ganho / Risco, **preservando integralmente as regras de negócio intocáveis** já consolidadas na fábrica.

---

## 1. Mapeamento Ponta a Ponta do Fluxo de Suprimentos

O ciclo de vida de um insumo/material abrange 7 fases funcionais:

```
[1. Solicitação / Falta]
         │
         ▼
[2. Triagem / Destino] ──────► [Liberado Estoque] ─► (Reserva / Separação)
         │
         ▼
[3. Cotações] (Multi-fornecedor / Decisão de Compra)
         │
         ├────────────────────────┐
         │ (Compra Parcial)       │ (Compra Integral / com Excedente)
         ▼                        ▼
[Saldo Residual em Cotação]   [4. Compras] (Lote Consolidado)
                                  │
                                  ├─► [5. Ordem de Compra - OC]
                                  │
                                  ▼
                             [6. Recebimento & Rateio]
                                  │
                   ┌──────────────┴──────────────┐
                   ▼                             ▼
       [Distribuição para OPs]        [Excedente para Estoque]
       (OPs marcadas c/ baixa)        (inventory + inventory_movements)
```

### 1.1. Etapa 1: Solicitações (Geração de Demanda)

- **Origens da Demanda:**
  1. _Automática via Separação do Operador (`OperatorSeparationTab.tsx` / `material-separations.ts`):_ Quando um operador registra "Falta" ou "Parcial" de um insumo na OP, é criado um registro em `material_shortages` com `status = 'Pendente'`, associado ao `order_id` (OP) e ao operador solicitante.
  2. _Manual via Suprimentos / PCP (`SolicitacoesPage.tsx` / `NewShortageModal.tsx`):_ Usuários do almoxarifado ou gestores cadastram requisições pontuais de ferramentas, matérias-primas ou itens de estoque geral (`order_id = null`).
- **Campos Principais:** `code`, `description`, `quantity`, `sector`, `status` ('Pendente'), `priority`, `request_type`, `order_id`, `requested_by`.
- **Onde vivem as regras:**
  - _UI:_ Validação de obrigatoriedade de descrição e quantidade (`> 0`). Verificação de duplicidade visual via `duplicate-detector.ts` (alerta se já houver solicitação aberta para a mesma OP e código).
  - _Servidor:_ `on_material_shortage_create.js` (atribui status 'Pendente' caso vazio; valida presença de descrição).

### 1.2. Etapa 2: Triagem (Separação entre Estoque e Compra)

- **Conceito:** A tela/diálogo de triagem (`SolicitacoesPage.tsx`, `TriageTable.tsx`, `TriageDetailDialog.tsx`, `TriageDialog.tsx`) permite ao analista decidir se a solicitação pode ser atendida imediatamente pelo estoque ou se deve ir para o mercado externo.
- **Ações Possíveis:**
  1. _Liberar do Estoque:_ Define `status = 'Liberado_Estoque'`. Permite que a produção retire o item sem comprar.
  2. _Enviar para Cotação:_ Define `status = 'Cotação'` e grava `quotation_date = hoje`.
  3. _Enviar Direto para Compras:_ Pula a cotação (ex.: insumos recorrentes com preço tabelado), define `status = 'Compra'` e grava `purchase_date = hoje`.
  4. _Reprovar/Cancelar:_ Define `status = 'Cancelado'`.
- **Onde vivem as regras:**
  - _UI:_ Quase 100% no cliente. Há até três componentes modais com comportamentos ligeiramente desarmônicos (`TriageDialog.tsx` vs `TriageDetailDialog.tsx` vs `TriageGroupDetailDialog.tsx`).
  - _Servidor:_ Nenhuma trava. Se um usuário fizer `update` direto via API mudando de 'Pendente' para 'Recebido', o banco aceita.

### 1.3. Etapa 3: Cotações

- **Conceito:** Coleta e comparação de propostas de múltiplos fornecedores para uma ou mais solicitações do mesmo item.
- **Telas & Componentes:** `CotacoesPage.tsx`, `CotacoesTable.tsx`, `EnhancedQuotationForm.tsx`, `QuotationDialog.tsx`.
- **Coleção vinculada:** `quotations` (`material_shortage_id`, `supplier`, `price`, `delivery_days`, `st_value`, `ipi_value`, `selected`).
- **Regras de Consolidação e Lote:**
  - O sistema agrupa solicitações abertas que possuem o mesmo código (ou descrição correspondente).
  - O formulário exibe a soma necessária de todas as OPs concorrentes.
  - O comprador escolhe a cotação vencedora e informa a **quantidade real a ser comprada**.
  - **Requisito Intocável (Saldo Residual):** Se o comprador comprar _menos_ que a soma solicitada, a função `splitShortageForPartialPurchase` / `advanceGroupWithDeficitSplit` desmembra a quantidade comprada para `status = 'Compra'` e mantém o registro remanescente com `status = 'Cotação'`, preservando o `order_id` e gerando observação de auditoria.
  - **Requisito Intocável (Lote por Código):** O agrupamento gera um `batch_id` compartilhado exclusivo para aquele código, nunca misturando códigos diferentes na mesma linha.
  - **Requisito Intocável (Excedente):** Se a compra for superior à soma das OPs (ex.: compra de pacote fechado de 50 un quando a demanda era de 14 un), cria-se um registro de excedente com `order_id = null` e observação "Compra para estoque", sob o mesmo `batch_id`.
- **Onde vivem as regras:**
  - _UI / Client Services:_ Toda a lógica de consolidação, split de saldo residual e cálculo de excedente está concentrada em `src/services/quotations.ts` (`advanceGroupToCompraWithSurplus`, `advanceGroupWithDeficitSplit`, `splitShortageForPartialPurchase`).
  - _Servidor:_ Não há hook de backend validando a coerência do split nem a pureza unívoca do `batch_id`.

### 1.4. Etapa 4: Compras (Gestão de Pedidos em Aberto)

- **Conceito:** Acompanhamento dos pedidos colocados com fornecedores, prazos de entrega e geração formal de Ordem de Compra.
- **Telas & Componentes:** `ComprasPage.tsx`, `ComprasTable.tsx`, `ComprasItemDialog.tsx`, `OrdemCompraModal.tsx`.
- **Visualização Consolidada:** O lote é renderizado como **UMA ÚNICA LINHA** na listagem (via `buildComprasDisplayItems`), exibindo a quantidade real comprada, o fornecedor, o valor total e prazo, com accordion para expandir as OPs atendidas e o excedente destinado ao estoque.
- **Regras de Edição de Quantidade (Travas implantadas 0.0.406–0.0.408):**
  - Se o usuário editar a quantidade na página Compras:
    - O sistema impede redução que viole as quantidades reais demandadas pelas OPs vinculadas;
    - O excedente absorve a flutuação;
    - Alterações que afetem demandas de OP exigem confirmação explícita em diálogo próprio (`pendingOpConfirmPlan`);
    - O histórico de alterações é registrado em `observation` com autor e data/hora.

### 1.5. Etapa 5: Ordem de Compra (OC)

- **Conceito:** Formalização jurídica/comercial do pedido ao fornecedor.
- **Telas & Componentes:** `OrdensCompraPage.tsx`, `OrdemCompraDocument.tsx` (geração de PDF para envio), `OrdemCompraGroupedView.tsx`, `OrdemCompraRow.tsx`.
- **Coleções:** `ordens_de_compra` (`oc_number`, `supplier_id`, `status`, `expected_date`, `total`, `delivery_type`, etc.) e `ordem_compra_itens` (`oc_id`, `material_shortage_id`, `code`, `quantity`, `unit_price`, `st_value`, `ipi_value`, `total`).
- **Automação de Encerramento (`oc-receiving-automation.ts`):** Quando os `material_shortages` atrelados a todos os itens da OC atingem `received_quantity >= quantity`, a OC é marcada automaticamente como `Recebida`.

### 1.6. Etapa 6: Recebimento e Rateio (SmartReceive)

- **Conceito:** Entrada física dos produtos na fábrica (doca/portaria). Conferência quantitativa e financeira.
- **Telas & Componentes:** `RecebimentoPage.tsx`, `RecebimentoTable.tsx`, `SmartReceiveDialog.tsx`.
- **Fluxo de Distribuição:**
  1. O conferente busca por lote, código ou descrição;
  2. Informa a quantidade total efetivamente entregue pela transportadora;
  3. Informa data de chegada, valor unitário real e frete rateado;
  4. Distribui a quantidade entre as OPs listadas (limitada ao teto individual restante: `quantity - received_quantity`);
  5. Caso sobre quantidade após atender as OPs (ou se for compra de lote com excedente), o saldo restante é classificado como **Excedente Direcionado ao Estoque**.
- **Onde vivem as regras:**
  - _UI (`SmartReceiveDialog.tsx`):_
    - Trava que impede distribuir soma superior ao total recebido (`isOverDistributed`);
    - Trava que impede distribuir para uma OP mais do que ela necessita (`max={remaining}`);
    - Gravação atômica: chama a rota backend `/backend/v1/suprimentos/distribute-material` enviando o payload estruturado de distribuição.
  - _Servidor (`material_distribution.js` e `on_material_receipt_to_inventory.js`):_
    - **Hook de Distribuição (`material_distribution.js`):** Executa transação em banco; atualiza `received_quantity`, `status` ('Recebido' ou 'Recebido_Parcial'), `unit_price`, `purchase_date`, `distributed_by`. Se houver excedente para estoque, credita na coleção `inventory` e gera registro em `inventory_movements` com `type = 'ENTRADA'`.
    - **Hook de Encerramento de Shortage (`on_material_shortage_update.js`):** Quando `received_quantity >= quantity`, força `status = 'Recebido'`. Se `received_quantity > 0` mas `< quantity`, força `status = 'Recebido_Parcial'`.
    - **Hook de Inventário (`on_material_receipt_to_inventory.js`):** Garante a atualização do saldo físico e cria o item em `inventory` caso não existisse.

### 1.7. Etapa 7: Distribuição, Baixa de Separação e Estoque

- **Reflexo na Produção:**
  - Quando a falta de uma OP é marcada como 'Recebido', o componente correspondente no modal de Separação do Operador (`OperatorSeparationTab.tsx`) tem sua pendência de falta resolvida, liberando a finalização da etapa ou a troca do status do insumo.
  - **Requisito Intocável (Isolamento de Registros):** A distribuição nunca marca registros alheios como Recebidos. O crédito é estritamente nominal aos IDs selecionados no rateio.
  - O excedente entra imediatamente no saldo disponível (`inventory.quantity`) e fica acessível para novas ordens e para o alerta de estoque mínimo (`pcp_material_min_levels`).

---

## 2. Máquina de Estados de `material_shortages`

### 2.1. Levantamento na Base de Dados e no Schema

Os valores permitidos no select `status` de `material_shortages` são:

1. `Pendente`: Demanda recém-criada (via separação ou manual), aguardando triagem.
2. `Liberado_Estoque`: Item existe no estoque da fábrica e a requisição foi liberada sem necessidade de compra externa.
3. `Cotação`: Item aprovado para aquisição; aguardando cotações com fornecedores.
4. `Compra`: Item com fornecedor/preço definidos e pedido colocado; aguardando entrega física.
5. `Recebido_Parcial`: Chegada de mercadoria inferior à quantidade comprada. Aguarda remessa complementar do fornecedor.
6. `Recebido`: Mercadoria entregue integralmente (`received_quantity >= quantity`). Ciclo da solicitação encerrado.
7. `Cancelado`: Requisição cancelada por duplicidade, cancelamento de OP ou erro de digitação.

### 2.2. Matriz Atual de Transições (Código Vigente)

| De \ Para            |    Pendente     | Liberado_Estoque |   Cotação    |    Compra    | Recebido_Parcial |     Recebido     |     Cancelado      |
| :------------------- | :-------------: | :--------------: | :----------: | :----------: | :--------------: | :--------------: | :----------------: |
| **Pendente**         |        —        |   ✅ (Triagem)   | ✅ (Triagem) | ✅ (Direto)  |        ❌        |  ⚠️ (Sem trava)  |  ✅ (Reprovação)   |
| **Liberado_Estoque** | ⚠️ (Reabertura) |        —         |      ❌      |      ❌      |        ❌        |        ❌        |         ⚠️         |
| **Cotação**          |       ⚠️        |        ❌        |      —       | ✅ (Avançar) |        ❌        |        ❌        |   ✅ (Descarte)    |
| **Compra**           |       ❌        |        ❌        | ⚠️ (Edição)  |      —       | ✅ (Recebimento) | ✅ (Recebimento) | ✅ (Recompra/Lote) |
| **Recebido_Parcial** |       ❌        |        ❌        |      ❌      |      ⚠️      |        —         |  ✅ (Conclusão)  |         ⚠️         |
| **Recebido**         |       ❌        |        ❌        |      ❌      |      ❌      |        ❌        |        —         |         ⚠️         |
| **Cancelado**        |       ❌        |        ❌        |      ❌      |      ❌      |        ❌        |        ❌        |         —          |

_Legenda: ✅ Transição normal de negócio | ❌ Bloqueado pela UI | ⚠️ Permitido na API por falta de validação no servidor._

### 2.3. Problemas, Transições Inválidas e Cantos Cegos Identificados

1. **OP Encerrada com Solicitação em Aberto ("Solicitação Fantasma"):**
   - _Cenário:_ Uma OP foi concluída, expedida ou cancelada no PCP, mas suas solicitações de material continuam com status `Pendente`, `Cotação` ou `Compra`.
   - _Consequência:_ O setor de compras compra materiais para ordens que já foram faturadas e despachadas, inflando custos desnecessariamente.
   - _Solução formal:_ Trigger de evento: quando `pcp_orders` muda para `Concluída` ou `Cancelada`, todas as solicitações atreladas (`order_id`) ainda em `Pendente` ou `Cotação` devem ser automaticamente arquivadas/canceladas com nota de auditoria; se estiverem em `Compra`, a UI deve emitir um alerta de redirecionamento para o Estoque Geral (`order_id = null`).

2. **Compra Cancelada com Saldo Pendente:**
   - _Cenário:_ Um pedido de compra de um lote é cancelado pelo fornecedor por falta de estoque.
   - _Comportamento atual:_ Se o usuário alterar para `Cancelado`, as OPs perdem o rastreio da falta e a fábrica fica sem o insumo sem saber.
   - _Solução formal:_ Cancelar uma compra atrelada a OPs em processo deve oferecer o retorno automático das solicitações para `Cotação` (mantendo a demanda ativa para outro fornecedor) em vez do descarte puro.

3. **Recebido Parcial que Nunca se Completa ("Insumo Zumbi"):**
   - _Cenário:_ O fornecedor entregou 80 de 100 peças e informou que não produzirá mais o saldo restante de 20 peças (ou cobrou apenas as 80).
   - _Comportamento atual:_ O registro fica eternamente em `Recebido_Parcial` na aba Recebimento, poluindo as métricas.
   - _Solução formal:_ Ação de "Encerrar Saldo Residual com Baixa": ajusta a quantidade final para 80, move para `Recebido` e, se a OP ainda precisar de 20, gera uma nova solicitação `Pendente`/`Cotação` para outro fornecedor.

4. **Transição "Recebido" sem quantidade recebida:**
   - Atualmente, se um operador editar manualmente um registro via API e colocar `status = "Recebido"` sem preencher `received_quantity`, o hook `on_material_shortage_update.js` não recalcula nem preenche `received_quantity = quantity`, gerando incoerência detectada pelo verificador diário (`received_quantity < quantity` com status `Recebido`).

### 2.4. Proposta da Máquina Formal de Estados

```
              ┌─────────────────────────────────────────────────────────────┐
              │                                                             │ (OP cancelada /
              ▼                                                             │  reprovação)
         [ PENDENTE ] ──────────► [ CANCELADO ] ◄───────────────────────────┤
              │                        ▲                                    │
              ├──────────┐             │                                    │
              ▼          ▼             │                                    │
    [ LIBERADO_ESTOQUE ] [ COTAÇÃO ] ──┘                                    │
                           │                                                │
                           ├─────────────────────┐                          │
                           ▼                     ▼                          │
                   [ SALDO RESIDUAL ]        [ COMPRA ] ────────────────────┤
                   (permanece COTAÇÃO)           │                          │
                                                 ├──────────────┐           │
                                                 ▼              ▼           │
                                       [ RECEBIDO_PARCIAL ] [ RECEBIDO ]    │
                                                 │              ▲           │
                                                 └──────────────┘           │
                                                (conclusão da entrega)      │
                                                 │                          │
                                                 ▼                          │
                                         [ ENCERRAR_SALDO ] ────────────────┘
                                         (gera nova falta p/ restante)
```

---

## 3. Conceitos Sobrepostos e Duplicidade de Fontes da Verdade

Hoje coexistem três entidades principais com atributos e propósitos parcialmente sobrepostos:

| Atributo / Conceito   | 1. Cadastro de Componentes (`components`)       | 2. Inventário Físico (`inventory`)                 | 3. Faltas / Compras (`material_shortages`)         |
| :-------------------- | :---------------------------------------------- | :------------------------------------------------- | :------------------------------------------------- |
| **Propósito Real**    | Catálogo mestre de engenharia e fichas técnicas | Saldo físico em prateleira e almoxarifado          | Requisições temporárias de suprimento/fluxo        |
| **Identificador**     | `id`, `code` (único por peça de engenharia)     | `id`, `code` (índice único COLLATE NOCASE)         | `id`, `code` (repetido a cada solicitação)         |
| **Descrição**         | Descrição técnica canônica                      | Descrição de estoque / prateleira                  | Descrição digitada ou copiada da OP/BOM            |
| **Origem do Dado**    | Engenharia, importação de catálogo ou manual    | Entrada física, compras e inventário inicial       | Separação do operador ou pedido manual             |
| **Unidade de Medida** | `unit` (mestre)                                 | `unit` (estoque)                                   | Ausente (implicitamente 'un' ou descrita na linha) |
| **Estoque Mínimo**    | `min_quantity` (adicionado na 0.131)            | `min_quantity` (existente desde a 0.092)           | N/A (usa `pcp_material_min_levels`)                |
| **Vínculo Físico**    | N/A                                             | `component_id` (relação opcional com `components`) | Nenhum vínculo formal (apenas string `code`)       |

### 3.1. Sobreposição 1: `components` vs `inventory`

- **Diagnóstico:** O sistema possui uma coleção `components` (cadastro mestre, ~930 registros) e uma coleção `inventory` (saldo físico, ~480 registros). Ambas possuem `code`, `description`, `min_quantity` e `unit`.
- **Atrito para o Usuário:** Na tela `ComponentesPage.tsx`, há itens que só existem no catálogo, itens que existem no estoque e itens que existem nos dois com pequenas divergências de descrição. Para editar um item, o usuário às vezes clica em editar o componente mestre, mas a quantidade física só muda se alterar o `inventory`.
- **Risco:** Quando um material novo é cadastrado em `components`, ele não cria automaticamente a linha de saldo zero em `inventory`, exigindo que o recebimento use busca por código e crie sob demanda.

### 3.2. Sobreposição 2: `material_shortages` como "Cadastro Paralelo"

- **Diagnóstico:** `material_shortages` guarda `code` e `description` como texto livre. Não há chave estrangeira `component_id` em `material_shortages`.
- **Consequência:**
  - Se um operador digita `PARAFUSO M6` e outro digita `PARAFUSO M6X6MM`, o sistema cria dois fluxos distintos de cotação e compra para a mesma peça física;
  - Ao receber a mercadoria, se o código digitado estiver com espaço ou caixa alta diferente, a busca do `inventory` falha ou cria duplicatas no almoxarifado.

### 3.3. Função da Tela de Triagem vs. Solicitações vs. Cotações

- **Diagnóstico:**
  - `SolicitacoesPage.tsx`: Apresenta uma tabela com abas "Todas", "Pendentes", "Triadas", "Estoque Geral" e botões para "Triar", "Abrir Cotação" ou "Enviar para Compras".
  - `CotacoesPage.tsx`: Apresenta praticamente a mesma tabela de itens, mas focada nas cotações de fornecedores. No entanto, também possui o botão "Triagem" e o modal `TriageDialog`.
  - Essa fragmentação faz o usuário sentir que está clicando três vezes no mesmo material em três páginas diferentes sem entender onde o item realmente está.

---

## 4. Regras de Negócio e Blindagem no Servidor (`pb_hooks`)

Uma das maiores causas de inconsistências históricas na base foi a concentração de validações críticas exclusivamente na interface do usuário (React/Vite). Sempre que um lote era manipulado em paralelo, recompilado ou salvo via script, as regras do frontend eram contornadas.

### 4.1. Inventário de Travas: Estado Atual vs Proposta de Blindagem

| #      | Regra de Negócio                                                             |                               Onde vive hoje                                | Risco Atual                                                                                       | Proposta de Blindagem no Servidor                                                                                                                                                                                         |
| :----- | :--------------------------------------------------------------------------- | :-------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **R1** | **Recebido nunca pode exceder o Comprado** (`received_quantity <= quantity`) |                        UI (`SmartReceiveDialog.tsx`)                        | Se a API for chamada com payload inflado, o banco grava e corrompe o saldo.                       | **Hook `on_material_shortage_update.js`:** Bloquear update se `newRecord.get('received_quantity') > newRecord.get('quantity')` (com erro 400).                                                                            |
| **R2** | **Lote nunca consolida códigos diferentes**                                  | UI (`buildComprasDisplayItems`, `batch-quantity-rules.ts`) e Migration 0139 | Se duas solicitações de códigos distintos receberem o mesmo `batch_id`, voltam a se fundir.       | **Hook `on_material_shortage_update.js` / `on_material_shortage_create.js`:** Se `batch_id` for informado, validar se já existem registros com esse `batch_id` que possuam `code` diferente. Se sim, rejeitar a operação. |
| **R3** | **Distribuição só dentro do recebido total**                                 |                        UI (`SmartReceiveDialog.tsx`)                        | Requisições concorrentes poderiam distribuir o dobro do que chegou fisicamente.                   | **Hook `material_distribution.js`:** Somar o total de `distributions` no payload e lançar exceção transacional se `totalDistribuido > totalRecebidoInformado`.                                                            |
| **R4** | **Isolamento de registros na distribuição**                                  |                       UI e `material_distribution.js`                       | Fechamento acidental de solicitações de outras OPs por busca solta de código.                     | **Hook `material_distribution.js`:** Já blindado na 0.138/0.142. Requer apenas assert formal de que `shortage.id` deve constar explicitamente no mapa de distribuição.                                                    |
| **R5** | **Saldo residual de compra menor permanece em Cotações**                     |           UI (`quotations.ts`: `splitShortageForPartialPurchase`)           | Se o frontend falhar no meio de duas chamadas de API, perde-se a parcela restante da solicitação. | **Endpoint Transacional no Backend:** Criar rota `/backend/v1/suprimentos/split-purchase` que executa a divisão e atualização atômica de criação do item comprado e atualização do saldo residual.                        |
| **R6** | **Trava anti-duplicidade em solicitações abertas**                           |                        UI (`duplicate-detector.ts`)                         | Usuários em abas diferentes geram duas faltas iguais para a mesma OP e mesmo código.              | **Hook `on_material_shortage_create.js`:** Se já houver registro com mesmo `order_id` e `code` em status `Pendente`, `Cotação` ou `Compra`, rejeitar ou converter em acréscimo de quantidade.                             |
| **R7** | **Excedente de Lote vinculado a Estoque (`order_id = null`)**                |                            UI (`quotations.ts`)                             | Criação acidental de excedente com `order_id` vinculado a uma OP qualquer.                        | **Hook `on_material_shortage_create.js`:** Se `observation` contiver "Compra para estoque" ou for excedente, forçar `order_id = null`.                                                                                    |

---

## 5. Cantos Cegos que já Geraram Bugs no Sistema

A auditoria histórica das migrations e commits (especialmente 0132 a 0142 e 0.0.406 a 0.0.409) revelou 5 padrões sistemáticos de falha:

1. **Bug da Contaminação Cruzada de Lotes Diferentes:**
   - _O que ocorreu:_ Na cotação conjunta de parafusos e arruelas, o sistema gerou um único `batch_id` para itens de códigos diferentes (ex.: Allen M4, M6 e Chipboard). Na tela de Compras, o lote virou uma única linha com a soma de todos os itens, sobrescrevendo descrições e preços.
   - _Lição:_ Lote é estritamente uma consolidação da **mesma peça** (mesmo código canônico) demandada por múltiplas OPs.

2. **Bug do Fechamento Alheio de Registros (Caso E27 / OP 433):**
   - _O que ocorreu:_ 12 soquetes E27 recebidos para as OPs 480–483 foram distribuídos por uma busca genérica baseada em código e fecharam a falta da OP 433, que estava aguardando entrega de outro pedido.
   - _Lição:_ A distribuição deve ser estritamente referencial por ID (`material_shortages.id`), nunca por varredura de código aberta.

3. **Bug da Inflação de Quantidade na Edição de Compras (Caso M6x6 50 un):**
   - _O que ocorreu:_ O usuário abriu a linha de lote em Compras para registrar que comprou uma caixa fechada de 50 un. O formulário substituiu o valor da solicitação da OP 488 (que era de 4 un) para 50 un, gerando uma demanda irreal de 50 parafusos para uma luminária que só usava 4.
   - _Lição:_ A demanda da OP é intocável pela tela de Compras. A quantidade adicional comprada é sempre classificada como **excedente para estoque** (`order_id = null`).

4. **Bug do Saldo Residual Perdido em Compra Parcial:**
   - _O que ocorreu:_ Havia demanda de 20 lâmpadas. O fornecedor só tinha 12. O comprador alterou a quantidade para 12 e avançou para Compras. As 8 restantes sumiram do sistema e a fábrica parou semanas depois por falta de lâmpada.
   - _Lição:_ Compra menor que a demanda gera split automático com criação de item em Compra (12 un) e manutenção do original em Cotação (8 un).

5. **Bug do Estoque sem Movimentação Rastreada:**
   - _O que ocorreu:_ Itens recebidos com excedente atualizavam `inventory.quantity`, mas não geravam linha correspondente em `inventory_movements`, tornando impossível auditar de onde veio o saldo.
   - _Lição:_ Toda alteração de saldo físico deve ter um registro correspondente de movimento com rastreio de lote e usuário responsável.

---

## 6. Proposta de Simplificação em Etapas Independentes

Para responder à queixa do usuário de que o módulo está _"complexo demais"_, a simplificação deve reduzir a fricção cognitiva e os passos manuais, **sem remover nenhuma das garantias conquistadas**.

A proposta está dividida em **5 Etapas**, ordenadas pela relação **Ganho / Risco** (maior benefício com menor impacto disruptivo primeiro):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                  ROTEIRO DE SIMPLIFICAÇÃO PROGRESSIVA                        │
├──────────────────────────────────────────────────────────────────────────────┤
│  Etapa 1: Unificação das Telas de Solicitações e Cotações (Hub de Compras)   │
│  [Ganho: Alto | Risco: Baixo] ──► Elimina navegação redundante               │
├──────────────────────────────────────────────────────────────────────────────┤
│  Etapa 2: Blindagem das Travas Críticas no Servidor (pb_hooks)               │
│  [Ganho: Máximo | Risco: Baixo] ──► Fim definitivo das corrupções de dados   │
├──────────────────────────────────────────────────────────────────────────────┤
│  Etapa 3: Automação da Triagem com Sugestão Inteligente de Estoque           │
│  [Ganho: Alto | Risco: Baixo/Médio] ──► 1 clique para liberar ou cotar       │
├──────────────────────────────────────────────────────────────────────────────┤
│  Etapa 4: Unificação Cadastral Componentes ↔ Inventário                      │
│  [Ganho: Médio/Alto | Risco: Médio] ──► Fonte única da verdade               │
├──────────────────────────────────────────────────────────────────────────────┤
│  Etapa 5: Ciclo de Vida Automatizado (Encerramento de OPs e Resíduos)        │
│  [Ganho: Médio | Risco: Médio] ──► Faxina contínua sem intervenção manual    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### ETAPA 1: Unificação das Telas de Solicitações e Cotações (O "Hub de Suprimentos")

- **Relação Ganho / Risco:** 🟢 **Altíssima (Ganho: Muito Alto | Risco: Baixo)**
- **Diagnóstico do Problema Atual:** Hoje o usuário precisa navegar entre `/pcp/suprimentos/solicitacoes`, abrir o modal de triagem, fechar, ir para `/pcp/suprimentos/cotacoes`, cotar e depois ir para `/pcp/suprimentos/compras`. São muitas abas que mostram praticamente os mesmos dados com colunas diferentes.
- **Escopo da Mudança:**
  1. Transformar a página `SolicitacoesPage.tsx` e `CotacoesPage.tsx` em uma interface integrada com abas contextuais claras:
     - **Aba 1: Fila de Entrada & Triagem** (Itens em `Pendente`);
     - **Aba 2: Em Cotação** (Itens agrupados por código, prontos para seleção de fornecedor e avanço para compra);
     - **Aba 3: Histórico de Solicitações** (Itens já encaminhados).
  2. Eliminar o vaivém entre abas: ao aprovar a triagem para cotação, a ação de preencher a cotação pode abrir diretamente sem exigir troca de rota.
  3. Manter a página `ComprasPage.tsx` como está (pois a visualização em lote de uma linha com accordion já foi aprovada e estabilizada).
- **Ganho para o Usuário Final:** Reduz em 60% os cliques diários do comprador; elimina a sensação de telas duplicadas.
- **Risco:** Mínimo. Mantém exatamente os mesmos endpoints, regras de consolidação e dados subjacentes.

---

### ETAPA 2: Blindagem das Travas Críticas no Servidor (`pb_hooks`)

- **Relação Ganho / Risco:** 🟢 **Excelente (Ganho: Máximo | Risco: Muito Baixo)**
- **Diagnóstico do Problema Atual:** Se houver instabilidade na rede ou erro no frontend durante um salvamento em lote, registros descompassados entram no banco, obrigando a rodar rotinas de reconciliação.
- **Escopo da Mudança:**
  1. Criar validação em `on_material_shortage_update.js`:
     - Impedir `received_quantity > quantity`;
     - Impedir associar um `batch_id` existente a um registro cujo `code` difira dos demais membros daquele lote.
  2. Ajustar `material_distribution.js`:
     - Validar que a soma de distribuições não exceda a quantidade total recebida daquela remessa;
     - Garantir que cada distribuição atinja estritamente o ID solicitado.
- **Ganho para o Usuário Final:** Confiabilidade total. A aba "Divergências" passa a ter zero ocorrências estruturais.
- **Risco:** Extremamente baixo, pois apenas rejeita operações ilegais que a UI já tenta bloquear.

---

### ETAPA 3: Automação da Triagem com Sugestão Inteligente de Estoque

- **Relação Ganho / Risco:** 🟡 **Alta (Ganho: Alto | Risco: Baixo a Médio)**
- **Diagnóstico do Problema Atual:** O usuário abre o modal de triagem e precisa lembrar ou abrir outra aba de Estoque para ver se há saldo antes de decidir se clica em "No Estoque" ou "Para Cotação".
- **Escopo da Mudança:**
  1. Na listagem de Solicitações Pendentes, exibir um badge imediato:
     - 🟢 **Em Estoque:** Se `inventory.quantity - reservas >= quantidade solicitada` (com botão de 1 clique: _"Liberar do Estoque"_);
     - 🔴 **Sem Estoque:** Se saldo disponível for 0 (com botão de 1 clique: _"Cotar"_);
     - 🟡 **Parcial:** Se o estoque atende apenas uma fração da solicitação.
  2. Possibilidade de "Aprovação em Massa": selecionar 10 itens sem estoque e enviá-los juntos para Cotação com 1 único clique.
- **Ganho para o Usuário Final:** O comprador não perde tempo abrindo ficha por ficha para saber se tem que comprar ou liberar do estoque.
- **Risco:** Baixo. Requer apenas cruzamento com o mapa de reservas (`material_reservations`), que já existe no serviço `material-reservations.ts`.

---

### ETAPA 4: Unificação Cadastral de Componentes e Estoque

- **Relação Ganho / Risco:** 🟡 **Média/Alta (Ganho: Médio/Alto | Risco: Médio)**
- **Diagnóstico do Problema Atual:** Há dois cadastros paralelos (`components` e `inventory`). O usuário fica em dúvida onde cadastrar uma peça nova e por que a quantidade só edita em um deles.
- **Escopo da Mudança:**
  1. Vincular formalmente cada item de `inventory` ao seu `component_id` correspondente.
  2. Quando um novo componente for criado no cadastro mestre, inicializar automaticamente o registro em `inventory` com saldo 0 (ou unificar a visualização para que toda peça de catálogo tenha sua linha de estoque virtual).
  3. Na criação manual de faltas, o campo de código e descrição passa a ser um autocomplete estrito que consulta o cadastro mestre, evitando variações de digitação (ex.: `PARAFUSO M6` vs `PARAFUSO M6X6MM`).
- **Ganho para o Usuário Final:** Fim dos materiais órfãos, nomes duplicados e divergências de unidades de medida.
- **Risco:** Médio. Exige migração de dados para amarrar os registros existentes que ainda estão sem `component_id`.

---

### ETAPA 5: Ciclo de Vida Automatizado de Demandas (Limpeza Automática)

- **Relação Ganho / Risco:** 🟡 **Média (Ganho: Médio | Risco: Médio)**
- **Diagnóstico do Problema Atual:** OPs encerradas mantêm solicitações em aberto; entregas parciais esquecidas viram insumos "zumbis".
- **Escopo da Mudança:**
  1. **Hook no encerramento de OP:** Quando uma ordem em `pcp_orders` mudar de status para `Entregue` ou `Cancelada`, o servidor busca `material_shortages` atrelados àquela OP que ainda estejam em `Pendente` ou `Cotação` e os encerra automaticamente com nota "OP encerrada sem necessidade de compra".
  2. **Ação de Encerramento com Baixa:** No modal de Recebimento, permitir o botão "Finalizar Pedido com Saldo Entregue", encerrando compras que o fornecedor não entregará mais e oferecendo reabertura da diferença se a OP ainda estiver em produção.
- **Ganho para o Usuário Final:** Fila de suprimentos limpa permanentemente, sem itens antigos acumulados de meses anteriores.
- **Risco:** Médio. Exige validação prévia com os gestores para garantir que nenhuma compra em trânsito seja cancelada inadvertidamente.

---

## 7. Quadro Resumo de Priorização das Etapas

|    Etapa    | Escopo Principal                                                     | Ganho Percebido | Risco Técnico  | Custo / Esforço | Prioridade Recomendada |
| :---------: | :------------------------------------------------------------------- | :-------------: | :------------: | :-------------: | :--------------------: |
| **Etapa 1** | Unificar Solicitações e Cotações em um Hub único                     |  🟢 Muito Alto  |    🟢 Baixo    |     Pequeno     |   **1ª (Imediata)**    |
| **Etapa 2** | Blindar travas de integridade no servidor (`pb_hooks`)               |    🟢 Máximo    |    🟢 Baixo    |     Pequeno     |   **2ª (Imediata)**    |
| **Etapa 3** | Sugestão automática de estoque na triagem + ação rápida              |     🟢 Alto     | 🟡 Baixo/Médio |      Médio      |   **3ª (Sequência)**   |
| **Etapa 4** | Unificação do cadastro Mestre ↔ Estoque (`components` ↔ `inventory`) |     🟡 Alto     |    🟠 Médio    |      Médio      |   **4ª (Planejada)**   |
| **Etapa 5** | Limpeza automática por encerramento de OP e resíduos                 |    🟡 Médio     |    🟠 Médio    |      Médio      |     **5ª (Final)**     |

---

## 8. Conclusão da Análise

O diagnóstico comprova que as regras de negócio essenciais da fábrica (rateio por OP, lote consolidado por código, excedente para estoque, conservação do saldo residual em cotação e isolamento estrito de registros) **estão corretas, bem fundamentadas e devem ser mantidas intocadas**.

A complexidade relatada pelo usuário decorre primariamente da **pulverização em telas separadas** (Solicitações vs. Triagem vs. Cotações) e da **falta de automação de conferência de saldo físico** na hora da triagem.

Com a execução do roteiro acima — iniciando pela **Etapa 1 (Hub Unificado de Suprimentos)** e **Etapa 2 (Blindagem no Backend)** —, a fábrica terá um fluxo muito mais simples, ágil e visualmente limpo, com zero risco de perda de rastreabilidade ou corrupção de dados.
