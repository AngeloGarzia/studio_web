import "dotenv/config";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { getEnv } from "./config/env.js";
import { createApp } from "./app.js";
import { createCompositionRoot } from "./compositionRoot.js";
import { wireSocketJoin } from "./infra/socket.js";
import { ensureAdmin } from "./bootstrap/ensureAdmin.js";

const env = getEnv();

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: env.APP_ORIGIN,
    credentials: true
  }
});
wireSocketJoin(io);

const { routers, prisma } = createCompositionRoot(io);
const app = createApp(routers);
httpServer.on("request", app);

await ensureAdmin(prisma);
httpServer.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API running on http://localhost:${env.PORT}`);
});
