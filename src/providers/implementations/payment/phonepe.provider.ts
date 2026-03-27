// src/providers/implementations/payment/phonepe.provider.ts
import axios from 'axios';
import * as crypto from 'crypto';
import { PaymentProviderInterface } from '../../interfaces/provider.interfaces';

export class PhonepeProvider implements PaymentProviderInterface {
  async createOrder(orderId: string, amount: number, currency: string, config: any): Promise<any> {
    if (!config.merchant_id || !config.salt_key || !config.salt_index) {
      throw new Error('PhonePe configuration is incomplete.');
    }

    // PhonePe expects amount in paise (multiply by 100)
    const amountInPaise = Math.round(amount * 100);
    const redirectUrl = `${config.frontend_url}/payment/success`;
    const endpoint = '/pg/v1/pay';

    // 1. Construct the payload
    const payload = {
      merchantId: config.merchant_id,
      merchantTransactionId: orderId,
      merchantUserId: `USER_${Date.now()}`, // Or pass actual user ID if available
      amount: amountInPaise,
      redirectUrl: redirectUrl,
      redirectMode: 'REDIRECT',
      callbackUrl: `${config.backend_webhook_url}/phonepe/webhook`,
      paymentInstrument: {
        type: 'PAY_PAGE',
      },
    };

    // 2. Encode payload to Base64
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');

    // 3. Calculate X-VERIFY Checksum: SHA256(base64Payload + endpoint + saltKey) + ### + saltIndex
    const stringToHash = base64Payload + endpoint + config.salt_key;
    const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
    const checksum = `${sha256}###${config.salt_index}`;

    // 4. Determine environment (UAT vs PROD)
    const baseUrl = config.is_production === 'true' 
      ? 'https://api.phonepe.com/apis/hermes' 
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

    // 5. Make request to PhonePe
    try {
      const response = await axios.post(
        `${baseUrl}${endpoint}`,
        { request: base64Payload },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-VERIFY': checksum,
            'accept': 'application/json',
          },
        }
      );

      return {
        providerOrderId: orderId,
        checkoutUrl: response.data.data.instrumentResponse.redirectInfo.url, // Redirect user here
        provider: 'PHONEPE',
      };
    } catch (error: any) {
      throw new Error(`PhonePe Payment Initiation Failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Webhook Signature Verification
  verifyPayment(paymentData: any, config: any): boolean {
    const { response, 'x-verify': receivedChecksum } = paymentData; // Usually passed in headers
    
    const stringToHash = response + config.salt_key;
    
    // Fixed the truncated line below:
    const calculatedChecksum = crypto.createHash('sha256').update(stringToHash).digest('hex') + '###' + config.salt_index;

    return calculatedChecksum === receivedChecksum;
  }
}