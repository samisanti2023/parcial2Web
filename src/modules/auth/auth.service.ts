import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtPayload } from './strategies/jwt.strategy';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
    @InjectRepository(RefreshToken)
    private refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  async register(dto: RegisterDto): Promise<LoginResponse> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new BadRequestException('El email ya está registrado');
    const user = await this.usersService.create({ ...dto, role: UserRole.MEMBER });
    return this.login(user);
  }

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    if (!user.isActive) throw new UnauthorizedException('Usuario inactivo');
    return user;
  }

  async login(user: User): Promise<LoginResponse> {
    const { accessToken, refreshToken } = this.signTokens(user.id, user.email, user.role);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.refreshTokenRepo.save({
      userId: user.id,
      token: refreshToken,
      expiresAt,
      revokedAt: null,
    });

    return { accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role } };
  }

  async refresh(payload: JwtPayload, refreshToken: string): Promise<LoginResponse> {
    const token = await this.refreshTokenRepo.findOne({
      where: { token: refreshToken, userId: payload.sub },
    });

    if (!token || token.revokedAt)
      throw new UnauthorizedException('Refresh token inválido o revocado');
    if (new Date() > token.expiresAt) throw new UnauthorizedException('Refresh token expirado');

    const user = await this.usersService.findById(payload.sub);
    const { accessToken, refreshToken: newRefreshToken } = this.signTokens(
      user.id,
      user.email,
      user.role,
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await this.refreshTokenRepo.save({
      userId: user.id,
      token: newRefreshToken,
      expiresAt,
      revokedAt: null,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.refreshTokenRepo.update({ userId, token: refreshToken }, { revokedAt: new Date() });
  }

  private signTokens(userId: string, email: string, role: UserRole) {
    const payload: JwtPayload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<string>('jwt.accessExpiresIn'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: this.config.get<string>('jwt.refreshExpiresIn'),
    });

    return { accessToken, refreshToken };
  }
}
