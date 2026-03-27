// twilio.provider.ts
import { Twilio } from 'twilio';
import { SmsProviderInterface } from '../../interfaces/provider.interfaces';

export class TwilioProvider implements SmsProviderInterface {
  async sendSms(phone: string, message: string, config: any): Promise<boolean> {
    if (!config.accountSid || !config.authToken || !config.fromNumber) {
      throw new Error('Twilio config incomplete.');
    }

    // Ensure phone number has country code (e.g., +91)
    const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;

    const client = new Twilio(config.accountSid, config.authToken);
    await client.messages.create({
      body: message,
      from: config.fromNumber,
      to: formattedPhone,
    });
    return true;
  }
}