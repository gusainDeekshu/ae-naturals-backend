// src/notifications/email.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private sesClient: SESClient;
  private smtpTransporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
   // Initialize SES using getOrThrow
    this.sesClient = new SESClient({
      region: this.configService.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('MY_AWS_ACCESS_KEY'),
        secretAccessKey: this.configService.getOrThrow<string>('MY_AWS_SECRET_KEY'),
      },
    });

    // Initialize SMTP
    this.smtpTransporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      secure: false, // true for 465, false for other ports
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string, retries = 2): Promise<boolean> {
    if (this.configService.get<string>('EMAIL_ENABLED') !== 'true') return false;

    const provider = this.configService.get<string>('EMAIL_PROVIDER');

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (provider === 'aws') {
          await this.sendViaSES(to, subject, html);
        } else {
          await this.sendViaSMTP(to, subject, html);
        }
        this.logger.log(`Email sent successfully to ${to} via ${provider}`);
        return true;
      } catch (error) {
        this.logger.error(`Attempt ${attempt} failed for ${provider}: ${error.message}`);
        
        // Fallback Logic
        if (attempt === retries) {
          this.logger.warn(`Initiating fallback provider...`);
          try {
            if (provider === 'aws') await this.sendViaSMTP(to, subject, html);
            else await this.sendViaSES(to, subject, html);
            this.logger.log(`Email sent successfully to ${to} via fallback provider`);
            return true;
          } catch (fallbackError) {
            this.logger.error(`Fallback failed: ${fallbackError.message}`);
            return false;
          }
        }
      }
    }
    return false;
  }

  private async sendViaSES(to: string, subject: string, html: string) {
    const source = this.configService.get<string>('AWS_SES_SOURCE');
    const command = new SendEmailCommand({
      Source: source,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject },
        Body: { Html: { Data: html } },
      },
    });
    await this.sesClient.send(command);
  }

  private async sendViaSMTP(to: string, subject: string, html: string) {
    const source = this.configService.get<string>('SMTP_USER');
    await this.smtpTransporter.sendMail({
      from: source,
      to,
      subject,
      html,
    });
  }
}