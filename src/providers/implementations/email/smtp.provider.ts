import { EmailProviderInterface } from '../../interfaces/provider.interfaces';
import * as nodemailer from 'nodemailer';

export class SmtpProvider implements EmailProviderInterface {
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor(private config: any) {
    const password = config.pass || config.password;
    if (!config.host || !config.user || !password) {
      throw new Error('SMTP configuration is incomplete.');
    }

    // 🔥 FIX: Add a proper Display Name so Google doesn't think it's a spam bot
    this.from = `"AE Naturals Admin" <${config.user}>`;

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: Number(config.port),
      // 🔥 FIX: Ensure strings like "true" are properly converted to boolean
      secure: String(config.secure) === 'true', 
      auth: {
        user: config.user,
        pass: password,
      },
    });
  }

  async send(to: string, subject: string, html: string): Promise<boolean> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html,
    });

    return true;
  }
}