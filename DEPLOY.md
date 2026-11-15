# Hosting Watch Together for free

**Current setup:** the app runs on **Back4app Containers** (free plan, no card) and the data lives in **MongoDB Atlas** (free cluster). Cost: 0.

| Part | Where | Notes |
|---|---|---|
| App | Back4app Containers → app `watch_together`, built from this repository's `Dockerfile` | Free plan: 0.25 vCPU, 256 MB RAM, 100 GB transfer per month |
| Database | MongoDB Atlas → project *Watch Together* → `Cluster0` (AWS Paris) | Free cluster: 512 MB; database `watch-together`, user `watchtogetheruser` |
| Code | `github.com/mel-mehdi/watch_together`, branch `main` | Back4app reads it through its GitHub app |

## The one catch: the free address lasts 60 minutes

Back4app's free plan gives a **temporary address** (for example `https://watchtogether-05nn7mqb.back4.app`) that stays live for **60 minutes** after a deploy. Fine for watching something with friends; not a site that is always on.

**To bring it back:** Back4app dashboard → *Web Deployment* → `watch_together` → **Action → Deploy the latest commit**. Wait about 2 minutes until the log says `DEPLOYMENT READY`, then use the address shown under the app name (it may change). Data is safe: accounts, rooms and messages live in Atlas, not in the container.

A permanent address needs a paid Back4app plan, or moving to Render's free plan (permanent address, but Render asks for a card once: a $1 temporary hold, not charged). The repository already contains `render.yaml` for that.

## Updating the site after a code change

Automatic deploys on push are a paid Back4app feature, so:

1. Push the code to `main` on GitHub.
2. Back4app → `watch_together` → **Action → Deploy the latest commit**.

## Settings (environment variables)

Back4app → `watch_together` → *Settings → Environment*. Changing one triggers a redeploy.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | `mongodb+srv://watchtogetheruser:<password>@cluster0.forkrs4.mongodb.net/watch-together?retryWrites=true&w=majority&appName=Cluster0` |
| `JWT_SECRET` | long random text (already set; changing it logs everyone out) |
| `SESSION_SECRET` | long random text (already set) |

The database password is the one set for `watchtogetheruser` in Atlas (*Security → Database Access → EDIT → Edit Password*). It is not your Atlas login. If you change it in Atlas, change it in `MONGO_URI` too.

Online, the server refuses to start without `JWT_SECRET` and `SESSION_SECRET`. If the database rejects the password, the site still loads and `/health` reports `"database": "disconnected"`.

## Check that it works

- `https://<your-address>/health` should show `"database": "connected"`.
- Open the site in two browsers (or one normal and one private window), create an account in each, create a room in one, join it from the other with the room code: chat, reactions and play/pause should sync.

## Troubleshooting

| Problem | Fix |
|---|---|
| Deploy says *container exited before becoming healthy* | Back4app → *Runtime Logs*. `Missing required environment variable(s)` → add them in Settings → Environment. |
| `/health` says `"database": "disconnected"`, log says `bad auth` | Wrong password in `MONGO_URI`: set a new one in Atlas and update `MONGO_URI`. |
| `/health` disconnected, log says timeout | Atlas → *Security → Network Access* must allow `0.0.0.0/0`. Atlas also pauses free clusters after a long time unused: *Clusters → Resume*. |
| Address no longer opens | The 60 minutes are over: **Action → Deploy the latest commit**. |

## Google sign-in (set up)

Works for any Google account (published, "In production").

| Where | What |
|---|---|
| Google Cloud → project *Watch Together* → *Google Auth Platform → Clients* → **Watch Together OAuth** | For each site address: Authorised JavaScript origin `https://<address>` and redirect URI `https://<address>/api/auth/google/callback`. Plus `http://localhost:3000/api/auth/google/callback` for local runs. |
| *Branding* | App name *Watch Together*, home page = the site, privacy policy = `/privacy.html` |
| Back4app → Settings → Environment | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

The server builds the redirect address from the address the visitor is on, so `GOOGLE_CALLBACK_URL` is no longer used (it can be deleted from Back4app).

**If the Back4app address changes** (Google shows `Error 400: redirect_uri_mismatch`): add the new address as an origin and a redirect URI in the Google client and save. Google can take a few minutes to apply it. Keep the old entries if you like; they do no harm.

Google keeps client secrets hidden after creation: if the secret is lost, use **Add secret** on the client and paste the new one into Back4app.

## Optional settings

| Variable | For |
|---|---|
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `FROM_EMAIL` | Password-reset emails. With Gmail: `EMAIL_HOST=smtp.gmail.com` and an App Password as `EMAIL_PASS`. |

## Running it on your computer

```bash
docker compose up -d --build
```

Then open http://localhost:3000. This uses a local MongoDB in Docker, not Atlas.
