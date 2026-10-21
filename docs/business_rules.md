# Regras de Negócio
## Estado (Beach vs Indoor)
- Beach (2x2): Bloqueio CONTA como 1º toque. Melhor de 3 sets (21/21/15).
- Indoor (6x6): Bloqueio NÃO conta como toque. Melhor de 5 sets.
## Taxonomia Imutável (Ledger)
Campos obrigatórios: match_id, set_id, rally_id, fase (side-out/contra-ataque), equipe, atleta_id, fundamento, qualidade, timestamp.

## Escala de qualidade e fim de rali
Escala de 6 símbolos (estilo Data Volley). **Só `#` e `=` têm efeito de regra**; os demais são convenção de quadra, gravada no ledger para análises. Os botões visíveis e as dicas de cada modalidade vêm de `qualityOptions()` em `src/features/scout/quality-hints.ts` (qualidade sem dica = botão oculto).

### Beach (linguagem da areia)
| Fundamento | `#` | `+` | `!` | `-` | `/` | `=` |
|---|---|---|---|---|---|---|
| Saque | Ace | Quebrou o passe | Passe regular | Passe na mão do adv. | Volta de graça | Erro de saque |
| Recepção (4 botões) | Na mão | — | Quebrou, dá p/ jogar | — | De graça p/ o adv. | Ace sofrido |
| Levantamento | Bola na pinta | Boa p/ atacar | Fora, dá p/ atacar | Ruim, só largar | Passou de graça | Erro (dois toques) |
| Ataque | Ponto | Defesa difícil | Defendido | Defesa fácil | Contra-ataque fácil | Erro (fora/rede) |
| Bloqueio | Ponto de bloqueio | Amorteceu | Tocou, segue | Tocou, volta fácil | Volta de graça | Erro (rede) |
| Defesa | Defesa na mão | Boa defesa | Defesa jogável | Só bola alta | Volta de graça | Erro de defesa |
| Bola de graça | Dificultou o adv. | Bem colocada | Neutra | Fácil p/ o adv. | Na mão do adv. | Erro (fora/rede) |
| Falta (1 botão) | — | — | — | — | — | Ponto adversário |

Na recepção do beach, a estatística "Passe na mão" = recepções `#` ÷ total (a fórmula `#+` do Box Score não muda; sem o botão `+`, ela mede o passe na mão).

### Indoor (linguagem de quadra)
| Fundamento | `#` | `+` | `!` | `-` | `/` | `=` |
|---|---|---|---|---|---|---|
| Saque | Ace | Quebrou recepção | Recepção regular | Recepção fácil | Volta de graça | Erro de saque |
| Recepção | Passe perfeito | Passe bom | Levant. se desloca | Só bola alta | Volta de graça | Ace sofrido |
| Levantamento | Atacante livre | Boa bola | Atacável | Difícil de atacar | Passou de graça | Erro de levant. |
| Ataque, Bloqueio | (iguais ao beach) | | | | | |
| Defesa | Defesa perfeita | Boa defesa | Defesa jogável | Defesa ruim | Volta de graça | Erro de defesa |
| Bola de graça, Falta | (iguais ao beach) | | | | | |

### Para onde vai a bola (fluxo da tela)
- Saque → destaca quem recebe; passe → mesma dupla, parceira armada p/ levantar; levantamento → quem passou armada p/ atacar; ataque → outro time (bloqueio/defesa).
- **A qualidade diz quando a bola cruzou a rede:** passe, defesa ou levantamento `/` → outro time; bloqueio `-` ou `/` (voltou fácil) → time que atacou; bloqueio `+` (amorteceu) → fica com quem bloqueou.
- A sugestão só destaca: os dois lados continuam tocáveis (exceto o time que sacou, logo após o próprio saque).

### O que encerra o rali (por prioridade)
1. **Ponto A / Ponto B**. Sem toques no rali: falta/arbitragem direto (rede, invasão, condução). Com o rali em andamento (modo detalhado): pergunta **"Como foi o ponto?"**, com as mesmas opções do modo rápido (ver Fase 9).
2. **4 toques**: a equipe que passar de 3 toques cede o ponto (no beach o bloqueio conta como toque; no indoor, não).
3. **Qualidade do último lance**:
   - `=` em qualquer fundamento → ponto do adversário (erro).
   - `#` em saque → ace; `#` em ataque ou bloqueio → ponto de quem tocou.
   - **Recepção `=` logo após o saque adversário → ace de quem sacou** (ponto, ace para a sacadora e erro de recepção para quem recebeu). Recepção `=` de uma bola de graça é erro, não ace.
   - Nenhuma outra qualidade encerra o rali.

### Bola de graça
Bola mandada para o outro lado **sem intenção de ataque**, só para mantê-la viva. Conta como toque da equipe, mas **não entra na estatística de ataque** (não soma em TA nem na eficiência), para não penalizar a atacante.

## Estatísticas agregadas (torneio, temporada)
- **Somar numeradores e denominadores, dividir só no final.** Eficiência = (ΣPA − ΣE) ÷ ΣTA; virada de bola = Σ ganhos recebendo ÷ Σ recebidos. Nunca a média das porcentagens de cada jogo (ex.: 40% em 10 ataques + 100% em 2 ataques = 50%, não 70%).
- **Rankings com volume mínimo:** eficiência de ataque exige ≥ 10 ataques; passe/recepção exige ≥ 10 recepções. Desempate por volume e depois pelo nome.
- **V/D e sets** vêm do resultado reconstruído de cada partida; partidas em andamento contam nos números, mas não em vitórias/derrotas.
- **Mesma pessoa = mesmo atleta:** cadastros duplicados são unidos por alias; é proibido unir dois atletas que jogaram a mesma partida.

## Modo rápido de scout (padrão)
- Durante o rali o analista só toca em **quem tocou na bola**; no fim toca em **PONTO** e escolhe **como foi o ponto**.
- Fundamentos deduzidos pela sequência (`src/domain/rally/quick-rally.ts`): 1º toque = saque; em cada posse, 1º = passe (após saque/bola de graça) ou defesa; último toque de posse que cruzou (2+ toques) = ataque; os do meio = levantamento. Bloqueio é marcado pelo analista ("Marcar próximo toque como bloqueio").
- "Como foi o ponto" dá a qualidade do lance final (`#` ace/ponto de ataque/bloqueio, `=` erros); "defesa não segurou" credita o ponto de ataque a quem atacou. Os demais toques ficam `?` (não avaliado) e ficam fora da % de passe.
- O rali é gravado inteiro, numa transação, ao marcar o ponto. "Desfazer último ponto" anula o rali inteiro e devolve os toques para corrigir.

## Quem começa sacando (sorteio)
- No 0×0 de cada set aparece "Quem começa sacando?". A escolha grava um evento `set_start` no ledger (não altera a partida, dá para desfazer). Depois do primeiro ponto do set, a escolha não vale mais.
- Sem escolha: set 1 = "Primeiro saque" da criação da partida; sets seguintes alternam.

## Como foi o ponto (modo rápido) — opções de vôlei de praia
- Pelo último toque: saque (fora / na rede), passe (ace), ataque (fora / na rede / **bloqueado → quem bloqueou**), bloqueio (fora / na rede), levantamento (dois toques / condução / fora), defesa (defesa não segurou / erro de defesa); ponto de quem tocou por último: ace, ponto de ataque, largada/shot, explorou o bloqueio, ponto de bloqueio.
- **Falta… (sempre disponível)**: toque na rede, invasão, dois toques, condução, quatro toques, pé na linha, demora no saque, ordem de saque, largada de dedos, ataque/bloqueio no saque, penalidade, outro/arbitragem → depois **quem cometeu** (ou "não sei quem").
- O detalhe fica gravado no lance (`detail`) e no fim do rali, para estatísticas de "como os pontos aconteceram".
- **Rali anulado (repetir)**: descarta os toques sem ponto para ninguém.

## Temporada, gênero e rankings globais (Fase 6)
- **Gênero mora no atleta** (`gender?: "M" | "F"`). O torneio tem **categoria** (`category?: "M" | "F" | "Mixed" | "Open"`). O gênero da dupla é **deduzido** (M+M → M, F+F → F, M+F → Misto; qualquer atleta sem gênero → indefinido).
- **Recorte por gênero:** com o filtro M/F ativo, só entra quem tem gênero preenchido; a tela mostra quantos ficaram de fora ("N atletas fora do recorte por falta de gênero").
- **Ano da temporada:** partidas de torneio usam o `start_date` do torneio; amistosos usam a data de criação da partida e só entram com "Incluir amistosos".
- **Temporada = soma de contadores** de todas as partidas do recorte (mesma regra da etapa; nunca média de %).
- **Rankings de duplas:** vitórias; % de vitórias (mín. 3 jogos decididos); virada de bola e quebra de saque (mín. 30 ralis); saldo de pontos.
- **Gráficos:** toda porcentagem vem com o volume (ex.: 48% · 61-12/102); pontos de evolução com pouco volume (< 10 ataques ou < 10 recepções avaliadas) aparecem esmaecidos, nunca escondidos.
- **Perfil do atleta** atravessa parcerias (aliases resolvidos: um cadastro antigo abre o perfil canônico); **perfil da dupla** só considera partidas daquele `pair_key`.

## Fluxo in-game e granularidade (Fase 7)
- **Nunca beco sem saída (modo rápido):** "Como foi o ponto?" sempre oferece **"Não vi como foi"** (ponto sem lance, motivo "marcado"), inclusive sem nenhum toque marcado.
- **Bola de primeira/segunda:** se a equipe pontua com o 1º ou 2º toque da posse, o ponto é **ataque `#` de quem tocou por último** (quem levantaria). Se perde no 2º toque, há "Bola de segunda fora / na rede / bloqueada", que viram **ataque `=`** (ou ataque seguido de bloqueio `#` do adversário). Dois toques / condução / levantamento fora continuam sendo erro de levantamento.
- **Bola de segunda na estatística:** é o ataque no 2º toque da posse, deduzido pela ordem dos toques (sem campo novo). Coluna **"2ª"** = pontos/tentativas; também conta em TA, PA e eficiência.
- **Erro de saque:** no modo detalhado o `=` do saque são dois botões, **"Erro: na rede"** e **"Erro: fora"** (detalhe gravado no lance). Box Score: **ES-R** (rede), **ES-F** (fora) e **ES** (total, inclui lances antigos sem detalhe).
- **Passe na mão:** aparece só quando há recepções **avaliadas** no recorte. Como o modo rápido não avalia o passe, a coluna, o card de ranking e o gráfico somem sozinhos.
- **Finalizar partida:** evento `match_end` (vencedor + motivo: placar atual, desistência/lesão, W.O., chuva, outro, com observação). O rali aberto não conta; o set em andamento fica **interrompido** (marcado com `*`, sem vencedor). V/D entram normalmente nas competições. **Desfazer reabre a partida.** Pelo placar atual, a sugestão é quem tem mais sets ou, empatado, mais pontos no set (serve para set único de 25).
- **Fase da competição:** aparece também nos cards da lista de partidas ("Torneio · Semifinal"; sem torneio, "Amistoso"). Fase de grupos, Oitavas, Quartas, Semifinal, Final, Disputa de 3º. Fica no vínculo partida → torneio; partida sem torneio é **amistoso**. **Mata-mata** = tudo que não é fase de grupos. Partidas sem fase registrada só entram no filtro "Todas".

## Sincronização com a nuvem (Fase 8)
- **O scout nunca depende da internet.** Sem rede, sem conta ou com sessão vencida, tudo funciona igual; a fila cresce e sobe quando der.
- **Conta:** e-mail e senha criados no painel do Supabase (sem cadastro público). Uma conta = um analista; tablet e computador entram na mesma conta.
- **Vínculo:** ao entrar pela primeira vez num aparelho, a tela **Conta** pergunta se o histórico deste aparelho deve ir para a conta. Só depois disso algo é enviado. Trocar de conta pede a confirmação de novo. **Sair não apaga nada.**
- **No computador:** basta entrar na mesma conta; os campeonatos, partidas e estatísticas scouteados no tablet aparecem sozinhos e ficam disponíveis offline.
- **Uma partida é scouteada em um aparelho só.** Se a mesma partida receber lances de dois aparelhos, nada é apagado e a tela Conta mostra a divergência.
- **Cadastro editado em dois aparelhos:** vale a última alteração enviada.
- **Dados de teste** (`/dev/seed`) nunca vão para a nuvem.

## Ponto no modo detalhado e produção (Fase 9)
- **"Ponto A/B" com o rali aberto** abre "Como foi o ponto?" (mesmas opções e mesma saída "Não vi como foi" do modo rápido, calculadas sobre os fundamentos que o analista já escolheu). Ex.: saque → passe → levantamento e "Ponto" da mesma equipe → **"Bola de segunda (ponto)"**: o levantamento vira **ataque `#` da levantadora** (conta em PA e na coluna "2ª").
- **Ledger:** nada é alterado. O trecho final do rali que muda é anulado (`void`) e regravado na mesma ordem; as cópias levam `replaces_event_id`, e tudo o que o "Como foi o ponto?" grava leva `via_point`. **Desfazer** esse ponto anula o fim e esses toques e regrava os toques originais: volta exatamente ao rali de antes do "Ponto".
- **`/dev/seed` em produção:** 404 (`next build`/Vercel). Só volta num servidor local com `ENABLE_DEV_SEED=true` no `.env.local`.

## Correções e exclusões (Fase 10)
- **Atleta:** só é excluída se nunca jogou (nem em partida da lixeira) e não está unida a outra. Duplicada? "Unir atletas". As duplas do cadastro com ela saem junto.
- **Dupla:** pode ser excluída sempre; as partidas já jogadas guardam nome e atletas.
- **Torneio:** excluir mantém as partidas (com todos os lances) como **amistosos**.
- **Partida:** torneio e fase mudam a qualquer momento; as duplas, só antes do primeiro lance. Excluir manda para a **lixeira** (some de listas, rankings e estatísticas; os lances ficam guardados) e dá para restaurar.
- **Sincronização:** a tela Conta mostra o que está guardado no aparelho para subir (partidas, lances, atletas, duplas, torneios), onde o envio parou e por quê, e o que a nuvem recusou — com "Enviar a versão deste aparelho", "Usar a versão da nuvem" ou "Ignorar". Lance nunca é substituído pela versão da nuvem.

## Siglas das tabelas (Fase 12)
Em cada fundamento: **total → acertos → erros → continuidade → índice**. Toque na sigla (ou passe o mouse) para ver o nome; "📖 Legenda" lista todas. O CSV usa sempre os nomes completos.
- **Ataque:** TA total de ataques · PA pontos de ataque · EA erros de ataque (inclui bloqueado) · AJ ataques em jogo · Efic. (PA − EA) ÷ TA · 2ª bola de segunda (pontos/tentativas).
- **Saque:** TS total de saques · Ace · ES erros de saque (ES-R rede, ES-F fora) · SJ saques em jogo = TS − Ace − ES.
- **Recepção:** TR total de recepções · Na mão (beach) / #+ (indoor) sobre as avaliadas · ER erros de recepção (aces sofridos).
- **Outros:** Pts (ataque + ace + bloqueio) · Blq pontos de bloqueio · Def total de defesas · J jogos. Duplas: V, D, Sets, Saldo, K1 virada de bola, K2 quebra de saque, EAdv pontos por erro do adversário.
- O histórico individual segue a atleta em qualquer dupla; o perfil mostra os números por torneio com a dupla de cada um.

## Micro-métricas, drill-down e relatórios (Fase 15)
Tudo é recalculado do ledger (nada persistido) e cada métrica é um contador bruto somado por atleta canônica. As micro-métricas ficam fora das tabelas compactas e aparecem em "Ver todas as métricas", no Construtor de relatórios e no CSV.
- **Posição na posse:** sequência de toques seguidos da mesma equipe (1º, 2º, 3º…). Tipo de ataque = detalhe × posição: "Ataque de primeira", "Ataque/Largada de segunda", "Ataque (3º toque)", "Explorando o bloqueio".
- **Ataque:** Bloq. ataques bloqueados (dentro do EA) · %PA e %EA sobre TA · Efic. K1 (ataques recebendo o saque, `phase = side_out`) e Efic. K2 (transição) · 1ª, 3º, Larg. (largada/shot) · ExpB pontos explorando o bloqueio.
- **Saque:** %Ace, %ES · **Pressão** = recepções adversárias `-`, `/` ou `=` logo após o saque ÷ saques cuja recepção foi avaliada · **Quebra** = ralis ganhos com o saque dela ÷ saques dela.
- **Recepção:** **Alvo** = recepções dela ÷ saques que chegaram à equipe (saques que não foram erro): quem o adversário escolheu sacar · %ER · K1 rec. = ralis ganhos quando ela recebeu ÷ recepções.
- **Bloqueio:** TB toques de bloqueio · Blq pontos · EB erros (`=`) · duplas: **bloqueios explorados** = pontos adversários com block-out contra a dupla.
- **Defesa:** Def+ defesas `#`/`+` · ED erros · K2 def. = ralis ganhos depois da defesa dela ÷ defesas.
- **Levantamento:** TL total, EL erros. **Erros:** Err total · **PE pontos entregues** (lance `=` ou ataque bloqueado num rali perdido) · Faltas (sem contato).
- **Momento do set** (pelo placar antes do rali): início (até ⅓ do alvo), meio, reta final (último ⅓); **clutch** = as duas equipes a 3 pontos ou menos do fim do set (21, 25 ou 15).
- **Drill-down:** todo número com volume abre de onde veio (tipo, resultado, set, momento, K1/K2, toque na posse, partida) e em que lances. Em contagens a soma do detalhamento é o número; em porcentagens, o detalhamento é a base do cálculo.
- **Origem dos pontos:** ataque, ace, bloqueio (e erro do adversário nas duplas); a soma é o total de pontos (= placar nas duplas), com o fundamento dominante destacado.
- **Relatório de torneio:** seções Feminino, Masculino, Misto (duplas mistas) e "sem gênero". Destaques com volume mínimo: eficiência de ataque (10 ataques), pressão de saque (10 saques avaliados), passe (10 recepções avaliadas), K2 de ataque (10); duplas K1/K2 (20 saques). Maior fonte de erros = pontos entregues por tipo, com quem mais cometeu cada um.
- **Modo comissão técnica:** preferência do aparelho que esconde scout e edição. Não é controle de acesso.

## Espelho tático, duelos e narrativa (Fase 16)
- **Cada rali fechado tem uma causa com duas leituras** (`rally-facts.ts`): o mérito de quem ganhou e o espelho em quem perdeu. Se uma dupla "explorou o bloqueio" 4 vezes, a outra tem "Bloqueio explorado" 4 nos pontos cedidos — sempre.

| Causa | Quem ganhou | Quem perdeu | Tipo do ponto cedido |
|---|---|---|---|
| Ace | Ace | Ace sofrido | mérito do adversário |
| Ataque com block-out | Explorou o bloqueio | Bloqueio explorado | mérito do adversário |
| Largada | Largada de segunda / (3º toque) | Largada … sofrida | mérito do adversário |
| Ataque | Ataque de primeira / de segunda / (3º toque) | Ataque … não defendido | mérito do adversário |
| Bloqueio # | Ponto de bloqueio | Ataque bloqueado | erro próprio (do atacante) |
| Lance = | Erro do adversário: saque fora… | Saque fora… | erro próprio |
| 4 toques / falta | Erro do adversário: 4 toques / falta | 4 toques / Falta: … | erro próprio |
| Ponto marcado sem lance | Ponto sem detalhe | Ponto cedido sem detalhe | sem detalhe |

- **Pontos cedidos** (antes "De onde vieram os erros"): separados em erros próprios e mérito do adversário; a soma é o placar do adversário. Na atleta, contam os ralis em que ela é a culpada (errou, foi bloqueada, sofreu o ace, teve o bloqueio explorado quando o toque de bloqueio foi registrado). Ponto sem atleta identificável conta só para a dupla.
- **Duelo:** o adversário de cada lance vem da sequência do rali — bloqueio → o atacante anterior; ataque → quem bloqueou/defendeu em seguida; saque → quem recebeu; recepção → quem sacou; defesa → o atacante anterior. Sem o toque do outro lado, não há nome (nunca inventado).
- **Narrativa do placar:** maior sequência de cada dupla (a partir de 3), viradas de liderança, empates e **trocação** (a partir de 6 side-outs seguidos: pontos de quem recebia).
- **Construtor:** marcar um grupo ordena, em ordem decrescente, pela métrica-foco dele (Geral → Pts, Ataque → Efic., Saque → Ace, Recepção → passe, Bloqueio → Blq, Defesa → Def, Levantamento → TL, Erros → Err). Em métricas de erro, decrescente = quem mais errou primeiro.
- **Drill por grupo:** em "Partida", "Set", "Momento", "K1/K2" e "Adversário", cada linha mostra a própria taxa da métrica (ex.: eficiência daquele jogo) e o **pico** fica destacado.
- **Toque decisivo (hotfix):** num ponto de ataque/bloqueio, a causa vem do último toque de quem GANHOU — não do último toque do rali. "Ataque # → defesa = do adversário → ponto" é ponto da atacante ("Ataque (3º toque)") e cedido pela defensora ("… não defendido").
- **"Como cada ponto saiu" da atleta** usa os mesmos contadores dos Pts (ataque # + ace + bloqueio # de cada lance): a soma das barras é sempre os pontos dela e a % é sobre esse total.

## Painel da atleta e virada de bola em detalhe (Fase 18)
- **Balanço:** acertos = pontos dela (ataque `#` com rali ganho + ace + bloqueio `#` com rali ganho); erros = pontos que ela entregou (`points_given`). Saldo = acertos − erros.
- **Alvo do saque:** recepções dela ÷ saques que chegaram à dupla (saque errado não conta).
- **Identidade ofensiva:** ataques no 1º, 2º (bola de segunda) e 3º toque da posse; **participação no ataque** = ataques dela ÷ ataques da dupla nas partidas em que ela estava no elenco.
- **Bloqueio explorado** (micro-métrica "Blq expl."; o widget Paredão saiu na Fase 19): ataque adversário com detalhe *block-out* logo antes do toque de bloqueio dela, num rali que ela perdeu. Sem o toque de bloqueio registrado, conta só para a dupla (nunca se inventa quem bloqueou).
- **Virada de primeira:** recepção dela em que a equipe ganhou o rali sem precisar de uma segunda posse (o primeiro ataque decidiu, inclusive quando o adversário errou a devolução) ÷ recepções dela.
- **Virada no rali longo:** recepções dela em que a equipe teve 2+ posses no rali; ganhos ÷ esses ralis.
- **Virada sob pressão:** recepções dela com a equipe vindo de 2+ pontos perdidos seguidos no mesmo set; ganhos ÷ essas recepções. A sequência é contada na partida inteira (antes de qualquer filtro de set).
- Proporções aparecem como barra 100% (nunca pizza), sempre com o volume; menos de 5 lances = esmaecido.

## Raio-X, maior arma e mapa de calor (Fase 19)
- **Raio-X de deficiências:** os pontos cedidos em que ela é a culpada (`RallyFact.culprit`), agrupados como no card "Pontos cedidos" (`causeRows`). A maior fraqueza é a causa mais frequente. No empate, vence o erro próprio. "Sem detalhe" não concorre. Só é apontada com **3 ou mais** ocorrências.
- **Maior arma:** a linha de "Como cada ponto saiu" (`scoredBreakdown`) com mais pontos, também com no mínimo 3. **Mais letal:** o tipo de ataque (tipo × toque da posse) com o maior aproveitamento (pontos ÷ ataques), com no mínimo **5 ataques**. No empate, ganha quem tem mais volume.
- **Drill jogo a jogo:** a barra de acertos abre a coluna "Pts" daquela partida; a de erros abre "PE" (pontos entregues); o ponto de eficiência abre "Efic.". O número da barra é sempre o total do drill.
- **Ocorrências:** toda barra de "Origem dos pontos", "Pontos cedidos", Raio-X e arma abre os lances agrupados por jogo, com o set e o placar **antes** do rali, do ponto de vista de quem está sendo analisado.
- **Mapa de calor das tabelas de torneio:** cada coluna tem um tom em `stat-columns.ts` (`COLUMN_TONE`): good = quanto mais, melhor; bad = quanto mais, pior; colunas de volume ficam neutras. A cor vai do mínimo ao máximo do recorte, sem a linha de total. ★ marca o líder nas colunas good e ▲ o maior ofensor nas bad (até 2 empatadas). Porcentagem com base menor que 5 fica sem cor e sem selo. Os cartões de **Destaques** pedem base de 10 ou mais, como os rankings.
- **Passe na mão** saiu do perfil da atleta (gráfico e tile). Nas tabelas e no ranking ele continua condicional, como na Fase 7.

## Cores semânticas e Raio-X da dupla (Fase 21)
- **A cor da barra diz de quem foi o ponto** (`point-tone.ts`, cores em `TONE`):
  - ganhos: **mérito próprio** (ataque, ace, bloqueio) na cor principal (amarelo); **erro do adversário** em cinza claro;
  - cedidos: **erro próprio** em vermelho (alerta); **mérito do adversário** em azul;
  - "sem detalhe" fica em cinza escuro.
- Do lado de quem ganhou, o tom sai do **grupo do placar**, não do `fault`. O ponto de bloqueio tem `fault: "own"` (o ataque bloqueado é erro de quem atacou), mas para quem bloqueou é mérito.
- A cor nunca fica sozinha: os cartões têm legenda e o rótulo da linha já diz a causa ("Erro do adversário: saque fora"). No PDF, o erro do adversário fica listrado.
- **Perfil da dupla:** Raio-X de deficiências e Maior arma no topo, com as mesmas regras e mínimos da Fase 19. O Raio-X lê os mesmos ralis do card "Pontos cedidos" da dupla. A arma soma os lances das duas atletas **naquela dupla**: os pontos de ataque, saque e bloqueio, sem o erro do adversário.
