import type { Server as SocketServer } from "socket.io";
import type { Router } from "express";
import type { PrismaClient } from "@prisma/client";

import { prisma } from "./infra/db.js";
import { createMailSender } from "./infra/mail.js";
import { createS3ObjectStorage } from "./infra/s3.js";
import { createSocketChatEmitter } from "./infra/socket.js";
import { MailService } from "./modules/mail/mail.service.js";

import { PrismaAuthRepository } from "./modules/auth/auth.repository.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { AuthController } from "./modules/auth/auth.controller.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";

import { HealthController } from "./modules/health/health.controller.js";
import { createHealthRouter } from "./modules/health/health.routes.js";

import { PrismaSettingsRepository } from "./modules/settings/settings.repository.js";
import { SettingsService } from "./modules/settings/settings.service.js";
import { SettingsController } from "./modules/settings/settings.controller.js";
import { createSettingsRouter } from "./modules/settings/settings.routes.js";

import { PrismaAncillaryFeeRepository } from "./modules/ancillaryFee/ancillaryFee.repository.js";
import { AncillaryFeeService } from "./modules/ancillaryFee/ancillaryFee.service.js";
import { AncillaryFeeController } from "./modules/ancillaryFee/ancillaryFee.controller.js";
import { createAncillaryFeeRouter } from "./modules/ancillaryFee/ancillaryFee.routes.js";

import { PrismaStayPromoRepository } from "./modules/stayPromo/stayPromo.repository.js";
import { StayPromoService } from "./modules/stayPromo/stayPromo.service.js";
import { StayPromoController } from "./modules/stayPromo/stayPromo.controller.js";
import { createStayPromoRouter } from "./modules/stayPromo/stayPromo.routes.js";

import { PrismaPricingRepository } from "./modules/pricing/pricing.repository.js";
import { PricingService } from "./modules/pricing/pricing.service.js";
import { PricingController } from "./modules/pricing/pricing.controller.js";
import { createPricingRouter } from "./modules/pricing/pricing.routes.js";

import { PrismaBookingRepository } from "./modules/booking/booking.repository.js";
import { BookingService } from "./modules/booking/booking.service.js";
import { BookingController } from "./modules/booking/booking.controller.js";
import { createBookingRouter } from "./modules/booking/booking.routes.js";

import { PrismaCalendarRepository } from "./modules/calendar/calendar.repository.js";
import { CalendarService } from "./modules/calendar/calendar.service.js";
import { CalendarController } from "./modules/calendar/calendar.controller.js";
import { createCalendarRouter } from "./modules/calendar/calendar.routes.js";

import { PrismaPortfolioRepository } from "./modules/portfolio/portfolio.repository.js";
import { PortfolioService } from "./modules/portfolio/portfolio.service.js";
import { PortfolioController } from "./modules/portfolio/portfolio.controller.js";
import { createPortfolioRouter } from "./modules/portfolio/portfolio.routes.js";

import { PrismaChatRepository } from "./modules/chat/chat.repository.js";
import { ChatService } from "./modules/chat/chat.service.js";
import { ChatController } from "./modules/chat/chat.controller.js";
import { createChatRouter } from "./modules/chat/chat.routes.js";

import { PrismaEstablishmentRepository } from "./modules/establishment/establishment.repository.js";
import { EstablishmentService } from "./modules/establishment/establishment.service.js";
import { EstablishmentController } from "./modules/establishment/establishment.controller.js";
import { createEstablishmentRouter } from "./modules/establishment/establishment.routes.js";

import { PrismaAccessLogRepository } from "./modules/accessLog/accessLog.repository.js";
import { AccessLogService } from "./modules/accessLog/accessLog.service.js";
import { AccessLogController } from "./modules/accessLog/accessLog.controller.js";
import { createAccessLogRouter } from "./modules/accessLog/accessLog.routes.js";

export type AppRouters = {
  health: Router;
  auth: Router;
  settings: Router;
  ancillaryFee: Router;
  stayPromo: Router;
  pricing: Router;
  booking: Router;
  calendar: Router;
  portfolio: Router;
  chat: Router;
  accessLog: Router;
  establishment: Router;
};

export function createCompositionRoot(io: SocketServer): {
  routers: AppRouters;
  prisma: PrismaClient;
} {
  const db = prisma as unknown as PrismaClient;
  const storage = createS3ObjectStorage();
  const chatEmitter = createSocketChatEmitter(io);

  const authRepo = new PrismaAuthRepository(db);
  const settingsRepo = new PrismaSettingsRepository(db);
  const mailService = new MailService(createMailSender(), settingsRepo);
  const ancillaryRepo = new PrismaAncillaryFeeRepository(db);
  const stayPromoRepo = new PrismaStayPromoRepository(db);
  const pricingRepo = new PrismaPricingRepository(db);
  const bookingRepo = new PrismaBookingRepository(db);
  const calendarRepo = new PrismaCalendarRepository(db);
  const portfolioRepo = new PrismaPortfolioRepository(db);
  const chatRepo = new PrismaChatRepository(db);
  const accessLogRepo = new PrismaAccessLogRepository(db);

  const authService = new AuthService(authRepo);
  const settingsService = new SettingsService(settingsRepo);
  const ancillaryFeeService = new AncillaryFeeService(ancillaryRepo);
  const stayPromoService = new StayPromoService(stayPromoRepo);
  const pricingService = new PricingService(pricingRepo, ancillaryFeeService);
  const bookingService = new BookingService(
    bookingRepo,
    pricingService,
    ancillaryFeeService,
    chatEmitter,
    mailService
  );
  const calendarService = new CalendarService(calendarRepo);
  const portfolioService = new PortfolioService(portfolioRepo, storage);
  const chatService = new ChatService(chatRepo, chatEmitter);
  const accessLogService = new AccessLogService(accessLogRepo);

  const routers: AppRouters = {
    health: createHealthRouter(new HealthController()),
    auth: createAuthRouter(new AuthController(authService)),
    settings: createSettingsRouter(new SettingsController(settingsService)),
    ancillaryFee: createAncillaryFeeRouter(new AncillaryFeeController(ancillaryFeeService)),
    stayPromo: createStayPromoRouter(new StayPromoController(stayPromoService)),
    pricing: createPricingRouter(new PricingController(pricingService)),
    booking: createBookingRouter(new BookingController(bookingService)),
    calendar: createCalendarRouter(new CalendarController(calendarService)),
    portfolio: createPortfolioRouter(new PortfolioController(portfolioService)),
    chat: createChatRouter(new ChatController(chatService)),
    accessLog: createAccessLogRouter(new AccessLogController(accessLogService)),
    establishment: createEstablishmentRouter(
      new EstablishmentController(new EstablishmentService(new PrismaEstablishmentRepository(db), mailService))
    )
  };

  return { routers, prisma: db };
}
