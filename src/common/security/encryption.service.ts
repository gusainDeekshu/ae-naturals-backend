// src/common/security/encryption.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly ivLength = 16;
  private readonly secretKey: Buffer;

  constructor() {
    // 1. Get the raw key from .env (it can now be any length)
    const rawKey = process.env.ENCRYPTION_KEY ;

    if (!rawKey) {
      throw new Error('ENCRYPTION_KEY is not defined in environment variables');
    }
    // 2. Hash it using SHA-256 to guarantee it is EXACTLY 32 bytes long
    // This prevents the "ERR_CRYPTO_INVALID_KEYLEN" crash completely
    this.secretKey = crypto.createHash('sha256').update(String(rawKey)).digest();
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(this.ivLength);
    
    // Pass the 32-byte hashed Buffer directly
    const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
    
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  decrypt(text: string): string {
    // Failsafe for empty or non-string inputs from the database
    if (!text || typeof text !== 'string') {
      throw new BadRequestException('Invalid payload provided for decryption');
    }

    const textParts = text.split(':');
    const ivHex = textParts.shift();

    // 1. Safety Check: Satisfies TypeScript and prevents crashes on malformed data
    if (!ivHex || textParts.length === 0) {
      throw new BadRequestException('Invalid encrypted payload format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    
    // Pass the 32-byte hashed Buffer directly
    const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv);
    
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString();
  }
}