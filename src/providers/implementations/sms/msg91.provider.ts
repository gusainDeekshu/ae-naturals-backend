// msg91.provider.ts
import axios from 'axios';
import { SmsProviderInterface } from '../../interfaces/provider.interfaces';

export class Msg91Provider implements SmsProviderInterface {
  async sendSms(phone: string, message: string, config: any): Promise<boolean> {
    if (!config.authKey || !config.templateId) throw new Error('MSG91 config incomplete.');

    await axios.post(
      'https://control.msg91.com/api/v5/flow/',
      {
        template_id: config.templateId,
        short_url: '0',
        recipients: [{ mobiles: phone, var1: message }] // Adjust variables based on your actual MSG91 template
      },
      {
        headers: { authkey: config.authKey, 'content-type': 'application/json' },
        timeout: 5000, // IMPORTANT: Do not let broken APIs hang your server
      }
    );
    return true;
  }
}