import { Body, Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, Max, Min, ValidateNested } from 'class-validator';
import { PowerParamsDto } from '../power/power.module';
import { COOLANTS, computeTransfer, optimizeTransfer } from './transfer';
import { CoolantId, TransferDesign, TransferInput } from './transfer.types';

export class TransferDesignDto implements TransferDesign {
  @IsIn(Object.keys(COOLANTS)) coolant: CoolantId;
  @IsNumber() @Min(0) @Max(1000) inletTemperature: number;
  @IsNumber() @Min(0) @Max(1000) outletTemperature: number;
  @IsNumber() @Min(0) @Max(100) condenserTemperature: number;
  @IsNumber() @Min(-20) @Max(50) ambientTemperature: number;
}

export class TransferDto implements TransferInput {
  @ValidateNested() @Type(() => PowerParamsDto) power: PowerParamsDto;
  @ValidateNested() @Type(() => TransferDesignDto) design: TransferDesignDto;
}

@Controller('energy-transfer')
export class TransferController {
  /** Caloporteurs disponibles et leurs limites. */
  @Get('coolants')
  coolants() {
    return Object.values(COOLANTS);
  }

  /** Chaîne de transfert d'énergie pour un réglage donné : puissances et flux du schéma. */
  @Post()
  @HttpCode(200)
  compute(@Body() input: TransferDto) {
    return computeTransfer(input.power, input.design);
  }

  /** Meilleur réglage de chaque caloporteur, comparé au réglage fourni. */
  @Post('optimize')
  @HttpCode(200)
  optimize(@Body() input: TransferDto) {
    return optimizeTransfer(input.power, input.design);
  }
}

@Module({ controllers: [TransferController] })
export class TransferModule {}
