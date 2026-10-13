# El Gran Viaje de la Fe · The Great Journey of Faith

A cooperative web game for the congregation. Members create a character, complete real missions (preaching, education, feeding, service and unity), and the whole group travels together through six worlds. Nobody competes, nobody loses points, and everyone advances to the next world at the same time.

It is built from `El_Gran_Viaje_de_la_Fe_MVP_Blueprint.xlsx`: its worlds, missions, classes, levels, cards, roles, rules and QA cases.

Works on phones and on a big screen (projector mode). Spanish by default, with an English button.

## What's inside

**For members** (bottom bar: Hoy · Mapa · ＋ · Personaje)
- **Hoy (home):** the current world's illustration with your character, a big **＋ Registrar actividad** button, your stars, the group's progress, your pair, coordinator notices, and the group's recent activity.
- **＋ Registrar:** four big buttons (Predicar, Estudiar, Apacentar, Servir), 13 activities in total. Daily activities count right away with a star burst. Baptisms, keeping service, signatures and EduLMS wait for a coordinator.
- **Stars are the only points.** They fill your level and the world's goal at the same time.
- **Celebrations:** a level-up screen with your character's new reward, and a "new world" screen when the group opens a world, after which the group walks along the map to it. Sounds can be turned off in Personaje.
- **Character creator:** 5 outfit styles, figure, skin, hair, eyes, smile, colors, hats and veil, back and hand items, companions, and level rewards (badge, glowing frame, aura, title, crown).
- **Pair challenge board** for each world (see below).

**For coordinators** (Líder tab)
- **Aprobar:** approve, send back or reject milestone reports, and remove a mistaken entry from the recent list.
- **Grupo:** the world's progress, group statistics, notices, invitations, and (for admins) members.
- **Resultados** (leaders only, never shown to members): participation, the star ranking of every member, the top 3 in each area for end-of-season awards (people preached to, studies, contacts, chapters read, fruits, signatures, EduLMS, feeding, service, prayer, active days, teamwork), who hasn't taken part yet, and a CSV download.
- **Ajustes** (admins): worlds and challenges, missions (stars, daily limit, approval, on/off), rules, manual adjustments, CSV exports, backup and audit.

**Projector mode:** Líder → Grupo → "Open board for projector".

## Install on your NAS

You need: a NAS that runs Docker (Synology "Container Manager", QNAP "Container Station", Unraid, TrueNAS, or any Linux box), and a free Cloudflare account so members can reach the game from anywhere.

### 1. Put the files on the NAS
1. On GitHub, open this repository and choose **Code → Download ZIP**.
2. Unzip it into a shared folder on the NAS, for example `docker/viaje`.
3. In that folder, copy `.env.example` to a new file named `.env` and open it:
   - `SETUP_CODE`: any code you like, for example `SION2026`. You'll use it once to create the admin account.
   - `TZ`: your time zone, for example `America/New_York` or `America/Santo_Domingo`.

### 2. Make it reachable from anywhere (Cloudflare Tunnel)
The tunnel gives you a secure `https://` address without opening ports on your router.

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com) and add a domain you own. If you don't have one, you can buy one there for about $10 a year.
2. Go to **Zero Trust → Networks → Tunnels → Create a tunnel**, choose **Cloudflared**, and name it `viaje`.
3. On the install screen, copy the long token (the text after `--token`) and paste it into `.env` as `TUNNEL_TOKEN=...`. You don't need to run the install command it shows.
4. Next, add a **Public hostname**:
   - Subdomain: `viaje` (or anything you like)
   - Domain: your domain
   - Service type: `HTTP`, URL: `viaje:8080`
5. Save. Your game address will be `https://viaje.yourdomain.com`.

> **No domain?** Tailscale Funnel also works. Install the Tailscale package on the NAS, turn on Funnel, and point it at port 8080. You get a free, fixed `https://<nas-name>.<your-tailnet>.ts.net` address. In that case remove the `tunnel:` service from `docker-compose.yml`.

### 3. Start it
- **Synology:** Container Manager → **Project → Create** → name `viaje` → choose the `docker/viaje` folder. It finds `docker-compose.yml`; click **Next → Done**. It builds and starts both containers.
- **QNAP:** Container Station → **Applications → Create**. Paste the contents of `docker-compose.yml` and set the folder.
- **Anything with SSH:** `cd` into the folder and run `docker compose up -d --build`.

Check that it works on your home network: `http://<NAS-IP>:8080`, for example `http://10.0.0.102:8080`.

### 4. First-time setup
1. Open your game address and tap **Tengo un código de invitación**.
2. Enter your `SETUP_CODE`, accept, and choose your name and PIN. This account is the **administrator**. The setup code stops working after this.
3. Create your character.
4. Go to **Líder → Invitaciones** to create invitation links. One link can have several uses (for example 25), so you can share it with the whole group. Make coordinator invitations separately.

### Updating
Download the new ZIP and replace the files, keeping your `.env`. Then in Container Manager choose **Project → viaje → Build** (or run `docker compose up -d --build`). The data is in the `viaje-data` volume and survives updates.

### Backups
**Líder → Auditoría → 💾 Copia de seguridad** downloads a full copy of the database. Do this weekly and at the end of the season. To restore, stop the project, copy the file into the volume as `viaje.db`, and start it again.

## Illustrations

World title cards, the welcome splash, the logo and the victory scene were made with Higgsfield. They live in `public/art/` (`w01.webp` … `w06.webp`, `splash.webp`, `logo.webp`, `victory.webp`). If a file is missing, the game falls back to its drawn look.

To download them, run `sh tools/fetch-art.sh` from the project folder on any computer with internet access, before building.

## World challenges

Each world opens when the group reaches its **star goal** and finishes its **challenge**:

| World | Stars | Challenge |
|---|---|---|
| 1. Forest of Awakening | 500 | Each pair reads 5 chapters of *Jactémonos de Dios* together |
| 2. Lake of Wisdom | 700 | Each pair gets 1 GA signature and passes 1 EduLMS course |
| 3. Bridge of Unity | 900 | Each pair preaches to 25 people in total |
| 4. Mountain of Perseverance | 1,100 | Each pair brings 5 contacts |
| 5. Garden of Fruits | 1,300 | The whole group brings 3 fruits (approved baptism reports) |
| 6. City of Promises | 1,500 | A fruit keeps service (at least 1 approved report) |

- **Pairs:** brothers with brothers, sisters with sisters. A member invites someone and the partner accepts. Everyone gets a new partner each world (last world's partner can't be chosen again). Coordinators can form pairs directly, add a third person when the numbers are odd, undo a pair, or excuse someone (sick, traveling) so they don't block the group.
- **Progress:** either partner logs what they did and when. Coordinators can log or remove entries for any pair. Each member gets +15 XP when their pair finishes (Líder → Reglas).
- **Board:** everyone sees every pair's status (done, in progress, not started, needs support) and who doesn't have a partner yet, so the group can pray for them. Pairs can ask for support, and anyone can tap "🙏 Oraré".
- Admins can change the star goals, the challenge texts and the targets in **Líder → Mundos**.

## How the rules work

- **Stars:** each activity gives its stars to everyone who took part, and once to the world.
- **Instant vs. approved:** daily activities count right away. Fruit (baptism, keeping service), sermon and GA signatures, and EduLMS courses wait for a coordinator. Admins can change which missions need approval in Ajustes → Misiones.
- **Mistakes:** a coordinator can remove an entry; its stars are taken back and the history is kept.
- **Unlocking a world** needs the star goal, the challenge, and the previous world completed. Then a coordinator confirms. Suggested dates are only a guide.
- **Privacy:** notes with phone numbers or emails are refused. There is no individual ranking.
- **Rule changes only affect future reports.** Every change is versioned and logged.

Earlier blueprint features (class abilities, weekly caps, mystery cards, special missions, anonymous guest codes) were removed to keep the game simple. The old missions stay in the database, switched off, and an admin can turn any of them back on in Ajustes → Misiones.

## For developers

Needs Node.js 22.13 or newer. There are no npm dependencies: it uses the built-in `node:sqlite`.

```bash
npm start      # http://localhost:8080  (prints the setup code on first run)
npm test       # rule tests based on the blueprint's QA sheet
```

Environment variables: `PORT` (8080), `DB_PATH` (`data/viaje.db`), `SETUP_CODE`, `COOKIE_SECURE=1` to force secure cookies.

```
server/catalog.js   worlds, missions, classes, levels, cards (from the blueprint)
server/engine.js    claims, approvals, ledger, caps, world unlocks
server/index.js     HTTP API, logins, roles, exports
public/js/avatar.js character art (SVG, drawn in code)
public/js/map.js    world map (SVG)
public/js/app.js    all screens
public/js/i18n.js   Spanish / English text
```
