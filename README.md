# RajMeet

RajMeet is a browser-based meeting workspace for creating and scheduling rooms, inviting people with short codes, and talking over peer-to-peer WebRTC. Its visual identity is built around calm, connected spaces rather than a conventional conference dashboard.

## Features

- JWT account registration and login with bcrypt password hashing
- MongoDB-backed profiles, scheduled meetings, participant sessions, meeting history, and messages
- Human-readable invitation codes such as `RAJ-482-731`
- Pre-join lobby with real camera and microphone permission controls
- Socket.IO signaling for WebRTC offers, answers, ICE candidates, participant state, and live chat
- Peer-to-peer camera, microphone, and browser screen sharing
- Responsive workspace, meeting controls, and persisted light/dark appearance
- Express validation, protected routes, security headers, CORS, and friendly API errors

## Stack

- Client: React 19, Vite, JavaScript, React Router, Axios, Tailwind CSS 4, Lucide React
- Server: Node.js, Express, Socket.IO, JWT, bcryptjs, Zod
- Data: MongoDB and Mongoose
- Media: browser WebRTC APIs (`getUserMedia`, `getDisplayMedia`, `RTCPeerConnection`)

## Architecture

The Vite app lives in `src/`. It calls the Express API through `/api`; Vite proxies both API and Socket.IO traffic to the server during development. The API and Socket.IO server share one Node process on port 5000. MongoDB stores accounts, meetings, participant durations, meeting timeline events, and chat messages.

At join time, the browser requests permission for selected media devices, posts the authenticated participant session to the meetings API, and connects its Socket.IO session. The server relays WebRTC signaling only between sockets in the same room. Media then flows peer-to-peer; it is not recorded or relayed by RajMeet. Chat messages are saved in MongoDB and broadcast through Socket.IO.

## Requirements

- Node.js 20.19+ and npm
- MongoDB 7+ locally, or a MongoDB Atlas connection string
- A browser with WebRTC support; camera and screen sharing require `localhost` or HTTPS

## Run locally

1. Install packages:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and set `MONGODB_URI` and a unique, long `JWT_SECRET`. `CLIENT_URL` should match the browser origin.

3. Start MongoDB, then run both services:

   ```sh
   npm run dev
   ```

   The client is at `http://localhost:5173`; the API health check is `http://localhost:5000/api/health`.

4. For a client-only production build:

   ```sh
   npm run build
   npm run preview
   ```

   To run the API outside development, use `npm start` after setting the same server environment variables.

## Environment variables

| Variable | Purpose | Example |
| --- | --- | --- |
| `PORT` | Express and Socket.IO port | `5000` |
| `CLIENT_URL` | Allowed browser origin; comma-separate origins if needed | `http://localhost:5173` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/rajmeet` |
| `JWT_SECRET` | Signing key for seven-day access tokens | Generate a unique random value |
| `VITE_API_URL` | Public API base URL used by the browser; include `/api` | `https://api.example.com/api` |
| `VITE_SOCKET_URL` | Public Socket.IO server origin; leave blank for same-origin proxy | `https://api.example.com` |
| `TURN_URLS` | Comma-separated TURN/TURNS URLs from a coturn REST-auth provider | Set on the API host only |
| `TURN_SHARED_SECRET` | Provider-issued coturn REST shared secret used to mint expiring credentials | Set on the API host only; never use a `VITE_` prefix |

The server can start without MongoDB configured so `/api/health` can report the disconnected state, but account and meeting APIs require a working database. `.env` is ignored by Git; only `.env.example` is tracked.

## Main API routes

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET/PUT /api/users/profile`
- `POST/GET /api/meetings`, `GET/PUT/DELETE /api/meetings/:meetingId`
- `POST /api/meetings/:meetingId/join`, `POST /api/meetings/:meetingId/leave`
- `GET/POST /api/meetings/:meetingId/messages`
- `GET /api/health`

Account, profile, create/list, edit/delete, join/leave, and message-history routes require a bearer token. Meeting metadata can be looked up by its invitation code so the lobby can show the room before joining.

## Realtime events

Socket.IO authenticates using the JWT in the handshake. `join-room` announces room membership; `user-joined` and `user-left` update the participant grid. `offer`, `answer`, and `ice-candidate` are relayed to the addressed socket in the same room. `participant-updated`, `screen-share-started`, and `screen-share-stopped` update room state. `send-message` persists and broadcasts chat messages.

## Deployment notes

- Deploy the API and client behind HTTPS, configure `CLIENT_URL` for the deployed client, and use a managed MongoDB deployment with network access restricted to the API.
- For separate client and API hosts, set `VITE_API_URL` and `VITE_SOCKET_URL` in the frontend build environment, and set `CLIENT_URL` on the API to the exact HTTPS frontend origin. Rebuild the frontend after changing its `VITE_*` public URLs. Keep the API host, database URI, and signing key out of the browser bundle.
- Set a strong, unique `JWT_SECRET` in the hosting provider’s secret manager. Do not put production secrets in Vite variables; `VITE_*` values are public in the browser bundle.
- The WebRTC path uses two public STUN servers and can request short-lived coturn REST credentials from the authenticated API. Configure `TURN_URLS` and `TURN_SHARED_SECRET` from a real provider on the API host for cross-network reliability; without provider credentials, peers fall back to STUN and some NAT/firewall pairs will fail.
- The current mesh topology sends a separate peer connection to each participant and the room registry is in process memory. For larger rooms or horizontally scaled API instances, add an SFU and a shared Socket.IO adapter such as Redis.
- Review token storage, retention, abuse controls, and observability against your deployment’s security requirements before opening registration publicly.

## Project layout

```text
src/
  components/MeetingRoom.jsx
  services/api.js
  App.jsx
  App.css
  index.css
server/
  config/database.js
  controllers/
  middleware/auth.js
  models/
  routes/
  sockets/meetingSocket.js
  server.js
```

## Future improvements

- TURN configuration UI and connection-quality telemetry
- SFU support for larger rooms and horizontal scaling
- Meeting editing/cancellation controls and richer event timelines
- Password reset, email verification, and revocable refresh sessions
- Automated API, component, and multi-peer browser tests