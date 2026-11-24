# Corre! — Pega-pega 3D

Jogo multiplayer de pega-pega em primeira pessoa, feito com Three.js, TypeScript,
Vite, Express e Socket.IO. A interface e as mensagens estão em português.

## O que já está no jogo

- Arena 3D em primeira pessoa, com braços em tela, olhar controlado pelo mouse
  ou toque, parque estilizado, obstáculos, iluminação, sombras e ambiente em movimento.
- Salas privadas com código de cinco caracteres, criação de partida e busca
  rápida por salas abertas.
- Partidas com até 12 pessoas, contagem regressiva, cronômetro, placar, feed de
  eventos e troca de pegador ao encostar.
- O pegador recebe pistas privadas a cada 12 segundos com direção e faixa de
  distância do jogador visível mais próximo; jogadores invisíveis não são revelados.
- Servidor autoritativo: o servidor move os jogadores, limita a arena e valida
  colisões e tentativas de pegar.
- Pulo com física e aterrissagem calculadas pelo servidor, disponível para
  escapar de tentativas de pega enquanto o jogador está no ar.
- Dash rápido na direção do movimento ou da câmera, com recarga validada pelo
  servidor.
- Parkour vertical em três níveis conectados por rampas e passarelas mais
  largas, com painéis e vigas. A colisão das bordas é circular e compartilhada
  entre servidor e cliente; o espaço sob cada passarela respeita sua espessura.
  Também há paredes paralelas para wall-run, slide com impulso em descidas e
  vault sobre barreiras baixas.
- Slipstream: correr atrás de outra pessoa por 1 segundo concede +15% de
  velocidade enquanto a perseguição continuar.
- Regra “batata quente”: o pegador tem 30 segundos, reiniciados quando pega
  alguém. Cada jogador tem duas vidas; ao zerar o cronômetro, perde uma vida e,
  se ainda tiver outra, reaparece protegido por 3 segundos. Sem vidas, vira
  espectador e o servidor escolhe outro pegador. A proteção também vale no
  início da rodada; jogadores protegidos não podem pegar nem ser pegos.
- Cristais ativados com `E`: corrida turbo, pulo alto, invisibilidade, bola de
  neve, rapel/gancho, onda de choque, granada de tinta, inversor de gravidade e
  troca de corpo. O servidor valida coleta, duração, colisões e efeitos.
- Controles de teclado e joystick para toque, botão mobile de slide, feedback
  visual/sonoro e layout adaptável. O cliente classifica o dispositivo como
  celular, tablet ou computador usando dicas do navegador, toque, user-agent e
  dimensões da tela. Em celulares, durante a contagem regressiva e a partida,
  uma tela pede orientação horizontal se o aparelho estiver em pé; notebooks e
  desktops não são bloqueados. O navegador não distingue notebook de desktop
  com confiabilidade, então ambos são classificados como computador.
- Trilha instrumental procedural em volume baixo, iniciada após o primeiro toque
  ou clique (restrição de autoplay do navegador) e silenciada junto dos efeitos.
- Endpoint `/health` para monitoramento e Blueprint `render.yaml`.

## Planta técnica da arena

A [planta 2D](./docs/arena-layout.svg) organiza os objetos em nove áreas, vistas
de cima. O eixo `X` cresce para a direita; o eixo `Z` cresce para baixo, então
o norte da arena é `-Z`. As passarelas e rampas usam cores diferentes para
indicar os níveis de altura.

As posições dos prédios e objetos escaláveis também estão agrupadas por área em
`src/shared/constants.ts`. Esse arquivo continua sendo a referência numérica
para colisões e modelos 3D; atualize a planta quando mover esses elementos.

## Requisitos

- Node.js 22.18 ou mais recente (o servidor importa constantes TypeScript
  compartilhadas com o cliente usando o suporte nativo do Node).
- npm 10 ou mais recente.

## Rodar localmente

Instale as dependências e gere os arquivos da aplicação:

```powershell
npm install
npm run build
```

Inicie o servidor multiplayer:

```powershell
npm start
```

Abra `http://localhost:3000` no navegador. Para iterar na interface com o Vite:

```powershell
npm run dev
```

Com o Vite, abra `http://localhost:5173`; a conexão Socket.IO é encaminhada ao
servidor local na porta `3000`. Em outro terminal, execute `npm start`.

## Testes e build

```powershell
npm test
npm run build
```

O build gera os arquivos da aplicação em `dist/`; o servidor Express entrega a
aplicação e o Socket.IO pelo mesmo endereço.

## Publicar no Render com Git

1. Crie um repositório vazio no GitHub (ou em outro provedor Git compatível) e
   envie esta pasta para ele. Se Git estiver instalado:

   ```powershell
   git init
   git add .
   git commit -m "Criar jogo multiplayer Corre"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
   git push -u origin main
   ```

2. No Render, escolha **New → Blueprint** e conecte o repositório. O arquivo
   `render.yaml` configura o serviço web, o build, o start e a verificação de
   saúde. Também é possível criar um **Web Service** manualmente com:

   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`

3. Aguarde o deploy e abra o endereço `.onrender.com`. Para jogar com outras
   pessoas, compartilhe esse endereço e o código da sala.

Não há endereço de repositório configurado neste projeto novo. O envio para um
repositório e a criação do serviço Render precisam ser feitos em uma conta à
qual você tenha acesso. O ambiente em que este projeto foi criado não tem o
executável Git instalado.

## Controles

| Ação | Computador | Celular |
| --- | --- | --- |
| Mover | `W`, `A`, `S`, `D` ou setas | Joystick na tela |
| Pular | `Espaço` | Botão **Pular** |
| Correr | `Shift` | Botão **Correr** |
| Deslizar | `C` ou `Ctrl` | Botão **Slide** (segure enquanto corre) |
| Dash | `Q` | Botão **Dash** |
| Usar cristal/poder | `E` | Botão **Poder** |
| Olhar ao redor | Arrastar o mouse na arena | Arrastar a tela |

## Configurações do servidor

- `PORT`: porta HTTP; o Render define essa variável automaticamente.
- `ALLOWED_ORIGIN`: origem permitida para Socket.IO. Por padrão, o mesmo serviço
  aceita conexões do próprio site.

As salas e os placares existem na memória do processo: reiniciar ou escalar o
serviço remove as partidas ativas. Para este jogo pequeno, mantenha uma única
instância do servidor; persistência e sincronização entre instâncias exigiriam
um banco de dados e um adaptador Redis, que ainda não fazem parte do projeto.
