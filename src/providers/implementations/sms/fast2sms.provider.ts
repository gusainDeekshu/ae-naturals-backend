// fast2sms.provider.ts
import axios from 'axios';
import { SmsProviderInterface } from '../../interfaces/provider.interfaces';

export class Fast2SmsProvider implements SmsProviderInterface {
  async sendSms(phone: string, message: string, config: any): Promise<boolean> {
    if (!config.apiKey) throw new Error('Fast2SMS API key missing.');

    await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      { route: 'q', message, language: 'english', flash: 0, numbers: phone },
      { 
        headers: { authorization: config.apiKey },
        timeout: 5000 
      }
    );
    return true;
  }
}