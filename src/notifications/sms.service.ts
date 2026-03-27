// src/notifications/sms.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private configService: ConfigService) {}

  async sendSMS(phone: string, message: string, retries = 2): Promise<boolean> {
    if (this.configService.get<string>('SMS_ENABLED') !== 'true') return false;

    const provider = this.configService.get<string>('SMS_PROVIDER');

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (provider === 'fast2sms') {
          await this.sendViaFast2SMS(phone, message);
        } else {
          await this.sendViaMSG91(phone, message);
        }
        this.logger.log(`SMS sent successfully to ${phone} via ${provider}`);
        return true;
      } catch (error) {
        this.logger.error(`SMS attempt ${attempt} failed via ${provider}: ${error.message}`);
        
        // Fallback
        if (attempt === retries) {
          this.logger.warn(`Initiating SMS fallback...`);
          try {
            if (provider === 'fast2sms') await this.sendViaMSG91(phone, message);
            else await this.sendViaFast2SMS(phone, message);
            return true;
          } catch (fallbackError) {
            this.logger.error(`SMS fallback failed: ${fallbackError.message}`);
            return false;
          }
        }
      }
    }
    return false;
  }

  private async sendViaFast2SMS(phone: string, message: string) {
    const apiKey = this.configService.get<string>('FAST2SMS_KEY');
    await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      { route: 'q', message, language: 'english', flash: 0, numbers: phone },
      { headers: { authorization: apiKey } }
    );
  }

  private async sendViaMSG91(phone: string, message: string) {
    const authKey = this.configService.get<string>('MSG91_AUTH_KEY');
    const templateId = this.configService.get<string>('MSG91_TEMPLATE_ID');
    // Note: MSG91 v5 requires structured payload. Adjust variables as per your MSG91 template.
    await axios.post(
      'https://control.msg91.com/api/v5/flow/',
      { template_id: templateId, short_url: '0', recipients: [{ mobiles: phone, var1: message }] },
      { headers: { authkey: authKey, 'content-type': 'application/json' } }
    );
  }
}