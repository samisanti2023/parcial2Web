import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../modules/users/entities/user.entity';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;

    const user: AuthenticatedUser = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('Usuario no autenticado');
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(`Se requiere rol: ${requiredRoles.join(', ')}`);
    }
    return true;
  }
}
