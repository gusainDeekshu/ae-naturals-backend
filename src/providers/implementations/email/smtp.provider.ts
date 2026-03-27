// smtp.provider.ts
import * as nodemailer from 'nodemailer';
import { EmailProviderInterface } from '../../interfaces/provider.interfaces';

export class SmtpProvider implements EmailProviderInterface {
  async sendEmail(to: string, subject: string, html: string, config: any): Promise<boolean> {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: Number(config.port),
      secure: config.secure === true || config.secure === 'true', // true for 465, false for other ports
      auth: { user: config.user, pass: config.password },
      tls: { rejectUnauthorized: false } // Helpful for self-signed certs in some environments
    });

    await transporter.verify(); // Fails fast if auth is wrong
    await transporter.sendMail({ from: config.from, to, subject, html });
    return true;
  }
}