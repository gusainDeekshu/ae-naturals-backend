// src/auth/guards/admin.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Populated by JwtStrategy

    
    if (!user || user.role !== 'ADMIN') {
      console.error(`Access Denied. User role is: ${user?.role}`);
      throw new ForbiddenException('Admin access required'); // Provides a clearer 403 error
    }
    return true;
  }
}
