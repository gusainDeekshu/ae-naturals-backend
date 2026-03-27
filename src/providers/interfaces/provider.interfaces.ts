// src/providers/interfaces/provider.interfaces.ts

export interface EmailProviderInterface {
  sendEmail(to: string, subject: string, html: string, config: any): Promise<boolean>;
}

export interface SmsProviderInterface {
  sendSms(phone: string, message: string, config: any): Promise<boolean>;
}

export interface PaymentProviderInterface {
  createOrder(orderId: string, amount: number, currency: string, config: any): Promise<any>;
  verifyPayment?(paymentData: any, config: any): boolean; // Optional, for webhook/signature verification
}