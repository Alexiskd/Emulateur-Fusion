import { BadRequestException, Body, Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { PowerParamsDto } from '../power/power.module';
import { ReactorParamsDto } from '../reactor/dto/reactor-params.dto';
import { RadialBuildError } from '../reactor/geometry';
import { TransferDesignDto } from '../transfer/transfer.module';
import { evaluatePlant, MAGNETS, optimizePlant } from './plant';
import { MagnetId, Objective, Operation, PlantInput, PlantOptimizationInput } from './plant.types';

export class PlantDto implements PlantInput {
  @ValidateNested() @Type(() => ReactorParamsDto) params: ReactorParamsDto;
  @ValidateNested() @Type(() => PowerParamsDto) power: PowerParamsDto;
  @ValidateNested() @Type(() => TransferDesignDto) design: TransferDesignDto;
  @IsIn(Object.keys(MAGNETS)) magnet: MagnetId;
  @IsOptional() @IsIn(['pulsed', 'steady']) operation?: Operation;
}

export class PlantOptimizationDto extends PlantDto implements PlantOptimizationInput {
  @IsIn(['efficiency', 'net', 'specific']) objective: Objective;
  @IsNumber() @Min(2) @Max(15) maxMajorRadius: number;
}

@Controller('plant')
export class PlantController {
  /** Technologies d'aimants disponibles. */
  @Get('magnets')
  magnets() {
    return Object.values(MAGNETS);
  }

  /** Performance d'un réacteur, de la géométrie à l'électricité nette. */
  @Post('evaluate')
  @HttpCode(200)
  evaluate(@Body() input: PlantDto) {
    try {
      return evaluatePlant(input);
    } catch (err) {
      if (err instanceof RadialBuildError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  /** Cherche le meilleur réacteur sur toute la chaîne, de l'entrée à la sortie. */
  @Post('optimize')
  @HttpCode(200)
  optimize(@Body() input: PlantOptimizationDto) {
    return optimizePlant(input);
  }
}

@Module({ controllers: [PlantController] })
export class PlantModule {}
