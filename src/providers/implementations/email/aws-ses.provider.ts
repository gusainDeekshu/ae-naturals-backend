// aws-ses.provider.ts
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { EmailProviderInterface } from '../../interfaces/provider.interfaces';

export class AwsSesProvider implements EmailProviderInterface {
  async sendEmail(to: string, subject: string, html: string, config: any): Promise<boolean> {
    if (!config.accessKeyId || !config.secretAccessKey || !config.region) {
      throw new Error('AWS SES configuration is incomplete.');
    }

    const sesClient = new SESClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    const command = new SendEmailCommand({
      Source: config.from,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
      },
    });
    
    await sesClient.send(command);
    return true;
  }
}