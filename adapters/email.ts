import nodemailer from "nodemailer";

export type EmailMessage = { to: string; subject: string; text: string };

export async function sendEmail(message: EmailMessage) {
  if (process.env.SMTP_ENABLED !== "true") return { delivered: false, mode: "disabled" as const };
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  await transporter.sendMail({ from: process.env.SMTP_FROM, ...message });
  return { delivered: true, mode: "smtp" as const };
}
