// sendgrid.provider.ts
import * as sgMail from '@sendgrid/mail';
import { EmailProviderInterface } from '../../interfaces/provider.interfaces';

export class SendGridProvider implements EmailProviderInterface {
  async sendEmail(to: string, subject: string, html: string, config: any): Promise<boolean> {
    if (!config.apiKey) throw new Error('SendGrid API key missing.');
    
    sgMail.setApiKey(config.apiKey);
    
    await sgMail.send({
      to,
      from: config.from,
      subject,
      html,
    });
    return true;
  }
}