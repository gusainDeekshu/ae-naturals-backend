// src/providers/providers.module.ts
import { Module } from '@nestjs/common';
import { ProviderConfigService } from './provider-config.service';
import { ProviderFactory } from './provider.factory';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonCacheModule } from '../common/cache/cache.module';
import { EncryptionService } from '../common/security/encryption.service'; // Assuming you created this from step 2

@Module({
  imports: [PrismaModule, CommonCacheModule],
  providers: [
    ProviderConfigService, 
    ProviderFactory, 
    EncryptionService
  ],
  exports: [ProviderConfigService, ProviderFactory], // Export for other modules to use
})
export class ProvidersModule {}