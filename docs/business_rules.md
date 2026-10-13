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
