# Interplanetary Presence

A two-person React, TypeScript, Vite and Three.js experience for communicating between Earth, the Moon and a Space Station. A host creates an open lobby with their location, another visitor joins it directly, and each message moves through four automatic stages:

1. Typed text
2. Generated voice using the same text
3. Facial expression, motion and intent
4. Point-cloud body and surrounding space

Supabase Realtime Broadcast carries messages and Presence tracks participants and open lobbies when Supabase is configured. Without Supabase, the app uses public MQTT-over-WebSocket internet relays, including a standard HTTPS-port (443) connection. Each host publishes a retained listing, so a later visitor receives the current directory without relying on simultaneous broadcasts. Broker acknowledgements confirm publication, last wills remove disconnected hosts, and reconnects restore listings. Neither participant needs to be on the same local network or enter a room code.

## Run locally

```bash
pnpm install
copy .env.example .env.local
pnpm dev
```

Optionally set these values in `.env.local` to use a dedicated Supabase transport:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Use the project URL and publishable key from the Supabase Connect dialog. Keep public channel access enabled under Realtime settings. The publishable key is intended for browser clients; never add a Supabase secret key to this project.

Open the local URL printed by Vite. Create an open lobby in one tab, then select that visible host from another tab or device. Lobby routing identifiers stay internal; neither person enters a room code.

For a single offline file:

```bash
pnpm export:standalone
```

Then open `dist/standalone.html`.

## Publish with GitHub Pages

1. Create a GitHub repository and push this project to its `main` or `master` branch.
2. Optionally, in **Settings → Secrets and variables → Actions → Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to use a dedicated Supabase project. Without them, the internet relay transport is used.
3. In **Settings → Pages**, choose **GitHub Actions** as the source.
4. Run the **Deploy to GitHub Pages** workflow, or push to the default branch.

The workflow in `.github/workflows/deploy-pages.yml` installs dependencies, builds `dist`, uploads the Pages artifact and deploys it. The generated site works under a repository subpath because Vite uses relative asset URLs.

Rooms use public relay topics or public Supabase Realtime channels and an unlisted eight-character code. Messages are ephemeral and are not stored by this app, but the fallback relay is not end-to-end encrypted and must not be used for sensitive content. For private or persistent conversations, add Supabase Auth, private-channel authorization, encryption and message storage before production use.

## Test and build

```bash
pnpm test
pnpm build
```

## Interaction

Choose Create open lobby or select a listed host, then enter your name and select a location and avatar for that session. The join step marks the host's location and avatar as selected and unavailable; the guest chooses from the remaining options. The lobby closes automatically when the second person arrives. The host types first. Sending is the only trigger: text travels first, the same message follows as generated voice, embodied cues arrive next and the point cloud completes the presence. Each reply unlocks only after all four stages reach the other participant.

The directory refresh button reconnects and reads the retained lobby snapshot. Do not interpret an unavailable directory as an empty one: the UI reports these separately. After a deployment, reload both participants' pages to use the same protocol version. Public relays are shared demonstration services without an uptime guarantee; use a dedicated Supabase project for a controlled deployment.

The sequence runs automatically. Its progress rail is read-only, and timing changes with the selected station pair.

The System design view includes controls for communication bandwidth and point-cloud reconstruction time.

## Calculation model

Reference constants:

```ts
const EARTH_MOON_DISTANCE_METERS = 384_400_000;
const SPEED_OF_LIGHT_METERS_PER_SECOND = 299_792_458;
const DEFAULT_LINK_RATE_MBPS = 331;
```

Each form uses:

```ts
readyTime =
  stagingOffset +
  distanceMeters / speedOfLightMetersPerSecond +
  payloadBits / (linkRateMbps * 1_000_000) +
  reconstructionTime;
```

With the reference Earth-Moon settings, text is ready at approximately 1.282 seconds, generated voice at 2.033 seconds, expression/motion/intent at 2.927 seconds, and the point cloud at 7.753 seconds after capture. For Earth-Space Station, propagation is approximately 0.00136 seconds instead of 1.282 seconds. Every stream shares the same light-speed propagation floor; payload, staging and reconstruction create the perceptual sequence.

## Reference sources

- NASA average Earth-Moon distance: https://spaceplace.nasa.gov/moon-distance/
- NIST speed of light: https://physics.nist.gov/cgi-bin/cuu/Value?c=
- NASA Lunar Laser Communication Demonstration: https://www.nasa.gov/mission/lunar-laser-communications-demonstration-llcd/
- IETF Opus audio codec: https://datatracker.ietf.org/doc/html/rfc6716
- Supabase Broadcast: https://supabase.com/docs/guides/realtime/broadcast
- Supabase Presence: https://supabase.com/docs/guides/realtime/presence
- GitHub Pages custom workflows: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
