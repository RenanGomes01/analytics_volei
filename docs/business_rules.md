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
1. **Ponto A / Ponto B** (rede, invasão, condução, arbitragem).
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
- **Fase da competição:** Fase de grupos, Oitavas, Quartas, Semifinal, Final, Disputa de 3º. Fica no vínculo partida → torneio; partida sem torneio é **amistoso**. **Mata-mata** = tudo que não é fase de grupos. Partidas sem fase registrada só entram no filtro "Todas".

## Sincronização com a nuvem (Fase 8)
- **O scout nunca depende da internet.** Sem rede, sem conta ou com sessão vencida, tudo funciona igual; a fila cresce e sobe quando der.
- **Conta:** e-mail e senha criados no painel do Supabase (sem cadastro público). Uma conta = um analista; tablet e computador entram na mesma conta.
- **Vínculo:** ao entrar pela primeira vez num aparelho, a tela **Conta** pergunta se o histórico deste aparelho deve ir para a conta. Só depois disso algo é enviado. Trocar de conta pede a confirmação de novo. **Sair não apaga nada.**
- **No computador:** basta entrar na mesma conta; os campeonatos, partidas e estatísticas scouteados no tablet aparecem sozinhos e ficam disponíveis offline.
- **Uma partida é scouteada em um aparelho só.** Se a mesma partida receber lances de dois aparelhos, nada é apagado e a tela Conta mostra a divergência.
- **Cadastro editado em dois aparelhos:** vale a última alteração enviada.
- **Dados de teste** (`/dev/seed`) nunca vão para a nuvem.
