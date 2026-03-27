//src/providers/implementations/payment/payu.provider.ts

import * as crypto from 'crypto';
import { PaymentProviderInterface } from '../../interfaces/provider.interfaces';

export class PayuProvider implements PaymentProviderInterface {
  async createOrder(orderId: string, amount: number, currency: string, config: any): Promise<any> {
    if (!config.merchant_key || !config.merchant_salt) {
      throw new Error('PayU configuration is incomplete.');
    }

    const txnid = orderId;
    const productinfo = 'Order Payment'; // You can pass dynamic data here
    const firstname = 'Customer'; // Pass dynamic data if available
    const email = 'customer@example.com'; 

    // Hash sequence required by PayU: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
    // (Empty pipes for unused UDF fields)
    const hashString = `${config.merchant_key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${config.merchant_salt}`;
    
    // Generate SHA-512 Hash
    const hash = crypto.createHash('sha512').update(hashString).digest('hex');

    // Determine environment URL
    const actionUrl = config.is_production === 'true'
      ? 'https://secure.payu.in/_payment'
      : 'https://test.payu.in/_payment';

    return {
      providerOrderId: txnid,
      provider: 'PAYU',
      // Send these to frontend to render a hidden form and auto-submit
      formPayload: {
        key: config.merchant_key,
        txnid: txnid,
        amount: amount,
        productinfo: productinfo,
        firstname: firstname,
        email: email,
        surl: `${config.frontend_url}/payment/success`, // Success URL
        furl: `${config.frontend_url}/payment/failed`,  // Failure URL
        hash: hash,
        actionUrl: actionUrl
      }
    };
  }

  verifyPayment(paymentData: any, config: any): boolean {
    // Reverse hash verification for webhook/success response
    // status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
    const { status, email, firstname, productinfo, amount, txnid, hash: receivedHash } = paymentData;
    
    const reverseHashString = `${config.merchant_salt}|${status}|||||||||||${email}|${firstname}|${productinfo}|${amount}|${txnid}|${config.merchant_key}`;
    const calculatedHash = crypto.createHash('sha512').update(reverseHashString).digest('hex');

    return calculatedHash === receivedHash;
  }
}