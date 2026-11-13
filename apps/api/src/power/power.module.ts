import { Body, Controller, HttpCode, Module, Post } from '@nestjs/common';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { computePowerBalance } from './power';
import { PowerParams } from './power.types';

export class PowerParamsDto implements PowerParams {
  @IsNumber() @Min(1) @Max(50000) fusionPower: number;
  @IsNumber() @Min(0.5) @Max(5000) auxHeatingPower: number;
  @IsNumber() @Min(0.05) @Max(1) heatingEfficiency: number;
  @IsNumber() @Min(0.3) @Max(1.6) blanketMultiplication: number;
  @IsNumber() @Min(0.01) @Max(0.7) thermalEfficiency: number;
  @IsNumber() @Min(0) @Max(20000) cryoPower: number;
  @IsNumber() @Min(0) @Max(2000) magnetPower: number;
  @IsNumber() @Min(0) @Max(0.2) pumpingFraction: number;
  @IsNumber() @Min(0) @Max(0.2) otherFraction: number;
  @IsOptional() @IsNumber() @Min(0.1) firstWallArea?: number;
}

@Controller('power-balance')
export class PowerController {
  /** Bilan de puissance : de la fusion à l'électricité nette. */
  @Post()
  @HttpCode(200)
  compute(@Body() params: PowerParamsDto) {
    return computePowerBalance(params);
  }
}

@Module({ controllers: [PowerController] })
export class PowerModule {}
