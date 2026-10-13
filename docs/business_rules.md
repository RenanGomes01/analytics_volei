# Regras de Negócio
## Estado (Beach vs Indoor)
- Beach (2x2): Bloqueio CONTA como 1º toque. Melhor de 3 sets (21/21/15).
- Indoor (6x6): Bloqueio NÃO conta como toque. Melhor de 5 sets.
## Taxonomia Imutável (Ledger)
Campos obrigatórios: match_id, set_id, rally_id, fase (side-out/contra-ataque), equipe, atleta_id, fundamento, qualidade, timestamp.

## Escala de qualidade e fim de rali
Escala de 6 símbolos (estilo Data Volley). **Só `#` e `=` têm efeito de regra**; os demais são convenção de quadra, gravada no ledger para análises. Fonte única das dicas exibidas na tela: `src/features/scout/quality-hints.ts`.

| Fundamento | `#` | `+` | `!` | `-` | `/` | `=` |
|---|---|---|---|---|---|---|
| Saque | Ace | Quebrou recepção | Recepção regular | Recepção fácil | Volta de graça | Erro de saque |
| Recepção | Passe perfeito | Passe bom | Levant. se desloca | Só bola alta | Volta de graça | Ace sofrido |
| Levantamento | Atacante livre | Boa bola | Atacável | Difícil de atacar | Passou de graça | Erro de levant. |
| Ataque | Ponto | Defesa difícil | Bola continua | Defesa fácil | Contra-ataque fácil | Erro (fora/rede) |
| Bloqueio | Ponto de bloqueio | Amorteceu | Tocou, segue | Tocou, bola fácil | Bola de graça | Erro (rede) |
| Defesa | Defesa perfeita | Boa defesa | Defesa jogável | Defesa ruim | Volta de graça | Erro de defesa |
| Bola de graça | Bem colocada | Boa | Regular | Fácil p/ adv. | Muito fácil | Erro |
| Falta | Não encerra | Não encerra | Não encerra | Não encerra | Não encerra | Ponto adversário |

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
