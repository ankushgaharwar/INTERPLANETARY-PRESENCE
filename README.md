# Interplanetary Presence

A two-person React, TypeScript, Vite and WebRTC experience for communicating between Earth, the Moon and a Space Station. Each person joins an invite-only room, chooses an unoccupied station and sends chat messages as three progressively richer forms:

1. Voice
2. Live video carrying facial expression, motion and intent
3. A simulated point-cloud reconstruction of body and surrounding space

WebRTC carries the live camera and microphone streams. Supabase Realtime Broadcast carries chat and WebRTC signaling, while Presence tracks the two connected participants. No database table is required. When Supabase is not configured, the app uses `BroadcastChannel` so the complete room flow can be tested in two tabs on the same computer.

## Run locally

```bash
pnpm install
copy .env.example .env.local
pnpm dev
```

Set these values in `.env.local` for cross-device rooms:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Use the project URL and publishable key from the Supabase Connect dialog. Keep public channel access enabled under Realtime settings. The publishable key is intended for browser clients; never add a Supabase secret key to this project.

Open the local URL printed by Vite. Create a room in one tab, copy its invite URL, and join it in another tab or device. The invite records the creator's station, so that location is disabled for the second person.

Camera and microphone access requires HTTPS or localhost and is only requested after the person selects **Enable camera & microphone**. The built-in public STUN server is enough for many direct connections. For reliable use across restrictive networks, add a TURN service:

```dotenv
VITE_TURN_URL=turn:your-turn-server.example.com:3478
VITE_TURN_USERNAME=your-turn-username
VITE_TURN_CREDENTIAL=your-turn-credential
```

For a single offline file:

```bash
pnpm export:standalone
```

Then open `dist/standalone.html`.

## Publish with GitHub Pages

To publish at `https://intergalacticpresence.github.io/`, the GitHub user or organization must be named `intergalacticpresence`, and its repository must be named `intergalacticpresence.github.io`. GitHub's standard user-site URL does not include `www`.

1. Create the `intergalacticpresence.github.io` repository under the `intergalacticpresence` account and push this project to its `main` or `master` branch.
2. In **Settings → Secrets and variables → Actions → Variables**, add `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TURN_URL` and `VITE_TURN_USERNAME`.
3. Add `VITE_TURN_CREDENTIAL` as an Actions secret. TURN is optional but strongly recommended for a public call site.
4. In **Settings → Pages**, choose **GitHub Actions** as the source.
5. Run the **Deploy to GitHub Pages** workflow, or push to the default branch.

The workflow in `.github/workflows/deploy-pages.yml` installs dependencies, builds `dist`, uploads the Pages artifact and deploys it. The generated site works under a repository subpath because Vite uses relative asset URLs.

Rooms use public Realtime channels and an unlisted eight-character code. Messages and signaling are ephemeral and are not stored in a database. WebRTC media remains peer to peer unless a TURN relay is required. For private or persistent conversations, add Supabase Auth, private-channel authorization and message storage before production use.

## Test and build

```bash
pnpm test
pnpm build
```

## Interaction

Create or join a room, choose Earth, Moon or Space Station, then copy the invite link to the second person. Each person enables camera and microphone before the conversation begins. The local camera is the dominant view, with the other station in a smaller remote monitor. The room creator speaks first. Each reply unlocks only after voice, live video and the simulated environment point cloud reach the other participant.

Use Play, Pause, Step and Reset to replay or inspect the presence sequence. Select a form below the spatial scene to emphasize its VR representation.

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

With the reference settings, voice is ready at approximately 1.283 seconds, expression/motion/intent at 2.177 seconds, and the point cloud at 7.003 seconds after capture. Every stream shares the same light-speed propagation floor; payload, staging and reconstruction create the perceptual sequence.

## Reference sources

- NASA average Earth-Moon distance: https://spaceplace.nasa.gov/moon-distance/
- NIST speed of light: https://physics.nist.gov/cgi-bin/cuu/Value?c=
- NASA Lunar Laser Communication Demonstration: https://www.nasa.gov/mission/lunar-laser-communications-demonstration-llcd/
- IETF Opus audio codec: https://datatracker.ietf.org/doc/html/rfc6716
- Supabase Broadcast: https://supabase.com/docs/guides/realtime/broadcast
- Supabase Presence: https://supabase.com/docs/guides/realtime/presence
- GitHub Pages custom workflows: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
