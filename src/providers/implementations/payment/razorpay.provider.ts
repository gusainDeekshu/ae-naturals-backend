// razorpay.provider.ts
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import { PaymentProviderInterface } from '../../interfaces/provider.interfaces';

export class RazorpayProvider implements PaymentProviderInterface {
  async createOrder(orderId: string, amount: number, currency: string, config: any): Promise<any> {
    const instance = new Razorpay({
      key_id: config.key_id,
      key_secret: config.key_secret,
    });

    const order = await instance.orders.create({
      amount: Math.round(amount * 100), // Razorpay accepts smallest currency unit (paise)
      currency,
      receipt: orderId,
    });

    return {
      providerOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      provider: 'RAZORPAY',
      key_id: config.key_id // Frontend needs this to initialize SDK
    };
  }

  // Use this in your webhook/success controller
  verifyPayment(paymentData: any, config: any): boolean {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = paymentData;
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", config.key_secret)
      .update(body.toString())
      .digest("hex");

    return expectedSignature === razorpay_signature;
  }
}