# 🤖 Discord Setup Bot (PT / EN)

**🇵🇹 Português** · [🇬🇧 English](#-english)

Bot que configura um servidor de Discord novo com um só comando, em português ou inglês.

## Funcionalidades

| | |
|---|---|
| 🛠️ **`/setup`** | Cria cargos (Admin, Staff, Premium, DJ, Membro, Bots), categorias, canais com permissões e todos os painéis. Modelos: Comunidade, Gaming, Estudo. Pode ser corrido várias vezes sem duplicar nada. |
| 👋 **Boas-vindas** | Mensagem com avatar, contador de membros, quem convidou e botões para Regras/Verificação/Cargos. Editável num popup (`/welcome message`), imagem de banner, DM opcional, mensagem de despedida. |
| ✅ **Verificação (popup)** | Os novos membros só veem o canal de verificação; ao clicar no botão aparece um popup para aceitar as regras e o servidor desbloqueia. Idade mínima da conta (anti-raid). |
| 🧭 **Onboarding nativo** | `/onboarding setup` configura os popups de perguntas do próprio Discord antes de entrar (servidores Comunidade). |
| 📨 **Convites** | Quem trouxe mais pessoas: leaderboard, quem convidou quem, deteção de saídas e contas falsas, bónus e **cargos de recompensa** automáticos (ex.: 10 convites → cargo). |
| 🎵 **Música** | `/play` com YouTube, Spotify, SoundCloud, Apple Music; fila, loop, shuffle, volume, botões de controlo. Restrito ao canal de música, controlo por cargo DJ. |
| 🎫 **Tickets** | Painel com categorias (suporte, denúncia, premium, parceria...), popup com o motivo, canal privado com a staff, assumir/fechar, transcrição guardada nos registos e enviada ao utilizador. |
| 💎 **Premium** | Área privada (chat + voz), `/premium grant` com duração (`30d`, `1mo`...) e expiração automática, **boosters recebem premium automaticamente**, +50% XP. |
| 🛡️ **Staff** | Área privada, `/mod` (warn, timeout, kick, ban, purge), `/announce` (popup), registos de entradas/saídas/mensagens apagadas e editadas. |
| ✨ **Extra** | Níveis/XP, sorteios, sugestões com votos e threads, painéis de cargos à escolha, `/help`. |

## Instalação

1. Cria uma aplicação em <https://discord.com/developers/applications> → **Bot** → copia o token.
2. Em **Bot → Privileged Gateway Intents** ativa **Server Members Intent** e **Message Content Intent**.
3. Convida o bot com permissão de **Administrador**:
   `https://discord.com/oauth2/authorize?client_id=SEU_CLIENT_ID&permissions=8&scope=bot%20applications.commands`
4. Requer **Node.js 22.13+** (recomendado: a versão LTS).
   ```bash
   npm install
   cp .env.example .env    # preenche DISCORD_TOKEN e CLIENT_ID
   npm run deploy          # regista os comandos (usa DEV_GUILD_ID para ser instantâneo)
   npm start
   ```
5. No servidor: `/setup` → confirmar. Depois **arrasta o cargo do bot para o topo** da lista de cargos.

`npm run check` valida as traduções e os comandos sem ligar ao Discord.

---

## 🇬🇧 English

A bot that sets up a brand-new Discord server with one command, in Portuguese or English.

**Features:** `/setup` (roles, categories, channels, permissions, panels — Community/Gaming/Study templates, safe to re-run) · welcome & goodbye messages (pop-up editor, banner, DM, inviter shown) · verification gate with a rules pop-up and minimum account age · Discord native Onboarding (`/onboarding setup`) · invite tracking (leaderboard, who invited whom, leaves/fakes, bonus, automatic reward roles) · music (YouTube, Spotify, SoundCloud, Apple Music; queue, loop, shuffle, volume, buttons, DJ role) · tickets (categories, reason pop-up, private channel, claim/close, transcripts) · premium area (timed grants with auto-expiry, boosters become premium automatically, +50% XP) · staff area (`/mod`, `/announce`, logs) · levels, giveaways, suggestions, self-role panels, `/help`.

**Install:** create an app at the Developer Portal, enable the **Server Members** and **Message Content** intents, invite it with Administrator (`permissions=8&scope=bot%20applications.commands`), then:

```bash
npm install
cp .env.example .env    # fill in DISCORD_TOKEN and CLIENT_ID
npm run deploy
npm start
```

Run `/setup` in your server and drag the bot's role to the top of the role list. The bot language is chosen per server (`/language`); slash command descriptions are shown in Portuguese to users whose Discord is set to Portuguese.

## Structure

```
src/
  index.js            client + startup
  deploy-commands.js  registers slash commands
  events.js           Discord events → modules, button/modal routing
  database.js         SQLite (node:sqlite, built into Node) + per-server settings
  i18n/               pt.js, en.js
  commands/           one file per slash command
  modules/            setup, welcome, verification, invites, tickets, premium, music, levels, giveaways, suggestions, selfroles, logs
```
