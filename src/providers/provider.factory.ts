// src/providers/provider.factory.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { EmailProviderInterface, SmsProviderInterface, PaymentProviderInterface } from './interfaces/provider.interfaces';

// Emails
import { SmtpProvider } from './implementations/email/smtp.provider';
import { AwsSesProvider } from './implementations/email/aws-ses.provider';
import { SendGridProvider } from './implementations/email/sendgrid.provider';
// SMS
import { Fast2SmsProvider } from './implementations/sms/fast2sms.provider';
import { Msg91Provider } from './implementations/sms/msg91.provider';
import { TwilioProvider } from './implementations/sms/twilio.provider';
// Payments
import { RazorpayProvider } from './implementations/payment/razorpay.provider';
import { StripeProvider } from './implementations/payment/stripe.provider';
import { PhonepeProvider } from './implementations/payment/phonepe.provider';
import { PayuProvider } from './implementations/payment/payu.provider';


@Injectable()
export class ProviderFactory {
  getEmailProvider(providerName: string): EmailProviderInterface {
    switch (providerName.toUpperCase()) {
      case 'SMTP': return new SmtpProvider();
      case 'AWS_SES': return new AwsSesProvider();
      case 'SENDGRID': return new SendGridProvider();
      default: throw new BadRequestException(`Email Provider ${providerName} not mapped`);
    }
  }

  getSmsProvider(providerName: string): SmsProviderInterface {
    switch (providerName.toUpperCase()) {
      case 'FAST2SMS': return new Fast2SmsProvider();
      case 'MSG91': return new Msg91Provider();
      case 'TWILIO': return new TwilioProvider();
      default: throw new BadRequestException(`SMS Provider ${providerName} not mapped`);
    }
  }

  getPaymentProvider(providerName: string): PaymentProviderInterface {
    switch (providerName.toUpperCase()) {
      case 'RAZORPAY': return new RazorpayProvider();
      case 'STRIPE': return new StripeProvider();
      case 'PHONEPE': return new PhonepeProvider(); // <--- ADDED
      case 'PAYU': return new PayuProvider();       // <--- ADDED
      default: throw new BadRequestException(`Payment Provider ${providerName} not mapped`);
    }
  }
}