// stripe.provider.ts
import Stripe from 'stripe';
import { PaymentProviderInterface } from '../../interfaces/provider.interfaces';

export class StripeProvider implements PaymentProviderInterface {
  async createOrder(orderId: string, amount: number, currency: string, config: any): Promise<any> {
    const stripe = new Stripe(config.secret_key, { apiVersion: '2023-10-16' as any });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: { name: `Order #${orderId}` },
            unit_amount: Math.round(amount * 100), // Stripe uses cents/paise
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      client_reference_id: orderId,
      // You can make these dynamic via the config DB if you want
      success_url: `${config.frontend_url}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.frontend_url}/payment/failed`,
    });

    return {
      providerOrderId: session.id,
      checkoutUrl: session.url,
      provider: 'STRIPE',
    };
  }
}