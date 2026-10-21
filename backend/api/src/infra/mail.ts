import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { getEnv } from "../config/env.js";

export type MailAddress = { email: string; name?: string };

export type SendMailInput = {
  to: MailAddress[];
  subject: string;
  html: string;
  text: string;
  replyTo?: MailAddress;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
};

/** Abstraction envoi email — SMTP (Brevo) derrière cette interface. */
export interface MailSender {
  readonly enabled: boolean;
  send(input: SendMailInput): Promise<void>;
}

class NoopMailSender implements MailSender {
  readonly enabled = false;
  async send(_input: SendMailInput): Promise<void> {
    // no-op (SMTP non configuré)
  }
}

class SmtpMailSender implements MailSender {
  readonly enabled = true;
  private readonly transporter: Transporter;
  private readonly from: MailAddress;

  constructor(opts: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: MailAddress;
  }) {
    this.from = opts.from;
    this.transporter = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.port === 465,
      auth: {
        user: opts.user,
        pass: opts.pass
      }
    });
  }

  async send(input: SendMailInput): Promise<void> {
    const from = this.from.name ? `"${this.from.name}" <${this.from.email}>` : this.from.email;
    const message = {
      from,
      to: input.to.map((t) => (t.name ? `"${t.name}" <${t.email}>` : t.email)).join(", "),
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments?.map((file) => ({
        filename: file.filename,
        content: file.content,
        contentType: file.contentType
      })),
      ...(input.replyTo
        ? {
            replyTo: input.replyTo.name
              ? `"${input.replyTo.name}" <${input.replyTo.email}>`
              : input.replyTo.email
          }
        : {})
    };
    try {
      await this.transporter.sendMail(message);
    } catch (error) {
      if (!transientMailError(error)) throw error;
      await this.transporter.sendMail(message);
    }
  }
}

function transientMailError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNRESET", "EAI_AGAIN"].includes(code)) return true;
  const responseCode = "responseCode" in error ? Number(error.responseCode) : 0;
  return responseCode >= 400 && responseCode < 500;
}

function emptyToUndef(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

export function createMailSender(): MailSender {
  const env = getEnv();
  const host = emptyToUndef(env.MAIL_HOST);
  const user = emptyToUndef(env.MAIL_USERNAME);
  const pass = emptyToUndef(env.MAIL_PASSWORD);
  const port = env.MAIL_PORT ?? 587;
  const sender = emptyToUndef(env.MAIL_SENDER) ?? emptyToUndef(env.MAIL_FROM_EMAIL);

  if (!host || !user || !pass) {
    // eslint-disable-next-line no-console
    console.warn("[mail] SMTP désactivé (MAIL_HOST / MAIL_USERNAME / MAIL_PASSWORD manquants)");
    return new NoopMailSender();
  }
  if (!sender) {
    // eslint-disable-next-line no-console
    console.warn("[mail] SMTP désactivé (MAIL_SENDER manquant — email vérifié dans Brevo)");
    return new NoopMailSender();
  }

  // eslint-disable-next-line no-console
  console.log(`[mail] SMTP prêt → ${host}:${port} (sender ${sender})`);
  return new SmtpMailSender({
    host,
    port,
    user,
    pass,
    from: {
      email: sender,
      name: emptyToUndef(env.MAIL_FROM_NAME) || "Studio des Grenadiers"
    }
  });
}
