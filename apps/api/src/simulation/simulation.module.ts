import { Body, Controller, HttpCode, Module, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min, ValidateNested } from 'class-validator';
import { PowerParamsDto } from '../power/power.module';
import { simulatePulse } from './simulation';
import { ScenarioParams, SimulationInput } from './simulation.types';

export class ScenarioParamsDto implements ScenarioParams {
  @IsNumber() @Min(1) @Max(3600) premagDuration: number;
  @IsNumber() @Min(1) @Max(3600) rampUpDuration: number;
  @IsNumber() @Min(1) @Max(3600) heatingDuration: number;
  @IsNumber() @Min(1) @Max(86400) flatTopDuration: number;
  @IsNumber() @Min(1) @Max(3600) rampDownDuration: number;
  @IsNumber() @Min(1) @Max(7200) dwellDuration: number;
}

export class SimulationDto implements SimulationInput {
  @ValidateNested() @Type(() => PowerParamsDto) power: PowerParamsDto;
  @IsNumber() @Min(0.1) @Max(100000) plasmaVolume: number;
  @ValidateNested() @Type(() => ScenarioParamsDto) scenario: ScenarioParamsDto;
}

@Controller('simulation')
export class SimulationController {
  /** Simule une impulsion complète : séries temporelles et bilan du cycle. */
  @Post()
  @HttpCode(200)
  simulate(@Body() input: SimulationDto) {
    return simulatePulse(input);
  }
}

@Module({ controllers: [SimulationController] })
export class SimulationModule {}
