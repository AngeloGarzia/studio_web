import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { getAppOrigins } from "./config/appOrigin.js";
import { optionalAuth } from "./middleware/auth.js";
import { establishmentContext } from "./middleware/establishment.js";
import { logAccess } from "./middleware/accessLog.js";
import { errorHandler } from "./middleware/errorHandler.js";
import type { AppRouters } from "./compositionRoot.js";

export function createApp(routers: AppRouters) {
  const allowedOrigins = new Set(getAppOrigins());
  const app = express();

  app.set("trust proxy", true);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true
    })
  );
  app.use(express.json({ limit: "5mb" }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(optionalAuth);
  api.use(establishmentContext);
  api.use(logAccess);

  api.use(routers.health);
  api.use(routers.auth);
  api.use(routers.establishment);
  api.use(routers.accessLog);
  api.use(routers.settings);
  api.use(routers.ancillaryFee);
  api.use(routers.stayPromo);
  api.use(routers.pricing);
  api.use(routers.booking);
  api.use(routers.calendar);
  api.use(routers.portfolio);
  api.use(routers.chat);

  app.use("/api", api);
  app.use(errorHandler);

  return app;
}
