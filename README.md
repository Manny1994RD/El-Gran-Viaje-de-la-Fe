# El Gran Viaje de la Fe · The Great Journey of Faith

A cooperative web game for the congregation. Members create a character, complete real missions (preaching, education, feeding, service and unity), and the whole group travels together through six worlds. Nobody competes, nobody loses points, and everyone advances to the next world at the same time.

It is built from `El_Gran_Viaje_de_la_Fe_MVP_Blueprint.xlsx`: its worlds, missions, classes, levels, cards, roles, rules and QA cases.

Works on phones and on a big screen (projector mode). Spanish by default, with an English button.

## What's inside

**For members**
- **Character creator.** Choose from 5 classes, each with its own outfit and team ability, then 2 figures, 8 skin tones, 10 hairstyles, 10 hair colors, 5 eye styles, 6 eye colors, 4 smiles, 12 main and 12 accent colors, pants or a long skirt, 7 head items (including a veil), 4 back items, 6 hand items and 4 companions (lamb, dove, lion cub, owl). There is also a "Surprise me" button.
- **Level rewards.** A badge, a glowing frame, an aura, a title and a unity crown appear on your character as you level up. You can hide them.
- **World map.** Six worlds along one road. Each obstacle visibly changes as the group works on it: the fog lifts, crystals light up, the bridge gets its planks, the wind calms, the garden blooms and the city turns gold. Your character and your companions stand at the current world.
- **Missions.** All 26 base missions and 12 special missions from the blueprint, with icons and filters. Reporting takes a few taps: how many, when, who was with you, and an optional note. Missions that help the current obstacle are marked 🔑.
- **My character.** Level, XP, weekly caps, contributions, level rewards and report history. Reports a coordinator sends back can be corrected and sent again.
- **Mystery cards and news.**

**For coordinators** (the **Líder** tab)
- An approval queue with Approve / Send back / Reject, with a warning when someone sent the same report twice on one day.
- A dashboard with the current world's progress, group statistics (no individual ranking), news posts and invitations.
- Confirming a world unlock once every requirement is met.

**For administrators**
- Rules and season settings, mission points and daily caps, world targets, revealing cards, managing members (roles, disable, reset PIN), corrections (void a report or adjust points with a reason), a full audit log, CSV exports and a one-tap database backup.

**Projector mode:** Líder → Panel → "Open board for projector". It shows the map, current progress and every member's character, and refreshes every 30 seconds.

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

## How the rules work

- **Points are provisional until a coordinator approves them.** Approving writes to a permanent points ledger. Mistakes are fixed with a reversing entry, never by editing or deleting.
- **Team missions:** every participant gets their points, but the event counts **once** toward the world's obstacle and stars.
- **World stars are never capped.** The weekly cap (60 mission XP + 20 bonus XP) applies to personal XP only. Fruit milestones (baptism +50, keeps worship +100) are exempt from the cap.
- **Unlocking a world** needs: the star target, the obstacle target, the minimum number of different people, and the previous world completed. Then a coordinator confirms. The suggested dates are only a guide, and a world stays open until it is completed.
- **Class abilities:** once a week, +5 to each participant of a joint mission that matches your class.
- **Privacy:** guests are tracked only by anonymous codes (`F-XXXXX`). Notes with phone numbers or emails are refused. There is no individual ranking.
- **Rule changes only affect future reports.** Every change is versioned and logged.

### Values still to confirm (from the blueprint's "Decisiones" sheet)
These are set to the blueprint's proposed values. An admin can change them in **Líder → Reglas / Misiones / Mundos**:

| Decision | Current value |
|---|---|
| Education points | EduLMS course 15, sermon signature 5, AGE/GA signature 8 |
| Feeding points | 5 per activity, 1 per day |
| Service points | 3 / 5 / 10 / 15 per the catalog, 1 per day |
| Weekly cap | 60 mission XP + 20 bonus XP (fruit milestones exempt) |
| World targets | 100 / 200 / 300 / 400 / 500 stars plus each world's obstacle |
| Review of individual Feeding/Service reports | Needs approval. It can be switched to auto-approve. |

PRE04 and PRE05 have no daily cap. They are limited to once per anonymous guest code instead, so two real baptisms on the same day are never lost.

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
