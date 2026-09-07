# Curimba · Nosso Cazuá

Biblioteca de pontos de Umbanda para uso ao vivo em tablet de 10 polegadas.
147 pontos extraídos do songbook do terreiro, classificados por linha, entidade, momento litúrgico e ritmo.

## Como o acervo está organizado

**Linha** (menu fixo no topo, sempre visível):

| Linha | Entidades | Pontos |
|---|---|---|
| Ritual | Abertura, Lei Maior, Defumação, Olorum, Sete Linhas, Descarrego, Subida de Orixás | 20 |
| Orixás | Oxalá, Logunã, Oxum, Oxumaré, Oxóssi, Obá, Xangô, Oroiná, Ogum, Iansã, Obaluaê, Nanã, Yemanjá, Omulu | 58 |
| Esquerda | Exu, Pombagira, Exu Mirim, Pombagira Mirim | 25 |
| Direita | Preto Velho, Caboclo, Baiano, Malandro, Marinheiro, Boiadeiro, Cigano, Erê | 44 |

**Momento litúrgico** (filtro dentro da entidade), na ordem em que a gira acontece:
abertura, defumação, chamada, saudação, firmeza, paga, descarrego, subida.

**Ritmo**: Angola, Ijexá, Nagô, Congo, Samba, Samba de Caboclo, BV, Barravento, Cabula.

**Entidade específica**: nome próprio quando existe (Tranca Ruas, Tiriri, Zé Pelintra).

**Coringa**: ponto que serve qualquer entidade da linha. Aparece na lista de todas elas.

Títulos foram gerados a partir da primeira linha cantada, que é como o ponto é chamado na prática.
São editáveis pela interface.

## Rodar local

```bash
npm install
npm run dev
```

Abre em `http://localhost:3000`. Sem `DATABASE_URL` o app usa um arquivo JSON local
(`seed/.dev-db.json`, ignorado pelo git) e não precisa de banco nenhum para você mexer no layout.

Senha de edição padrão em desenvolvimento: `cazua`.

## Deploy no Railway

1. `railway init` na pasta, ou conecte o repositório pelo dashboard.
2. No projeto, **New → Database → PostgreSQL**.
3. No serviço do app, em **Variables**, adicione:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (referência, não cole o valor)
   - `SENHA_EDICAO` = a senha do terreiro
4. Deploy. No primeiro boot o servidor cria a tabela e carrega os 147 pontos do `seed/pontos.json`.
   Boots seguintes detectam que já há dados e não mexem em nada.
5. **Settings → Networking → Generate Domain** para pegar a URL pública.

No tablet, abra a URL no Chrome e use "Adicionar à tela inicial". Vira ícone e abre em tela cheia,
sem barra de endereço comendo espaço vertical.

## Endpoints

| Método | Rota | Senha | O que faz |
|---|---|---|---|
| GET | `/api/pontos` | não | Lista todos os pontos |
| GET | `/api/meta` | não | Linhas, momentos e ritmos válidos |
| POST | `/api/login` | corpo | Confere a senha |
| POST | `/api/pontos` | header | Cria ponto |
| PUT | `/api/pontos/:id` | header | Edita ponto |
| DELETE | `/api/pontos/:id` | header | Exclui ponto |
| GET | `/health` | não | Healthcheck do Railway |

A senha vai no header `x-senha`.

## Detalhes de uso ao vivo

- **Tela sempre acesa**: o app pede `wakeLock` ao carregar, então o tablet não apaga no meio de um ponto longo.
- **Tamanho da letra**: botões `A−` e `A+` no canto do ponto, de 17px a 56px. A escolha fica salva no tablet.
- **Queda de rede**: o acervo é guardado no `localStorage` quando carrega. Se o wifi cair, o app abre com a
  última cópia que o tablet viu, em vez de tela branca. Não substitui um PWA de verdade, mas evita o pior.
- **Cores por linha**: âmbar no Ritual, azul nos Orixás, vermelho na Esquerda, verde na Direita. Serve para
  você saber onde está pelo canto do olho, sem ler.

## Estrutura

```
src/server.js      API Express e validação
src/db.js          Camada de dados (Postgres, ou arquivo em dev) e seed
public/index.html  Estrutura da tela
public/style.css   Tema escuro, alvos de toque grandes
public/app.js      Navegação, filtros, busca e formulário
seed/pontos.json   Os 147 pontos classificados
```
