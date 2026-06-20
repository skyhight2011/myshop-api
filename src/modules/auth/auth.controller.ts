import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: { id: number }) {
    return this.authService.getProfile(user.id);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Patch('profile')
  updateProfile(
    @CurrentUser() user: { id: number },
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.id, updateProfileDto);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Get('sessions')
  getSessions(@CurrentUser() user: { id: number }) {
    return this.authService.getSessions(user.id);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Delete('sessions/:id')
  revokeSession(
    @CurrentUser() user: { id: number },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.authService.revokeSession(user.id, id);
  }

  @ApiBearerAuth()
  @Post('logout')
  logout(@Headers('authorization') authorization?: string) {
    const token = authorization?.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    return this.authService.logout(token);
  }
}
