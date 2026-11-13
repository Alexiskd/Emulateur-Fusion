import { IsInt, IsNumber, Max, Min } from 'class-validator';
import { ReactorParams } from '../reactor.types';

export class ReactorParamsDto implements ReactorParams {
  @IsNumber() @Min(0.5) @Max(15) majorRadius: number;
  @IsNumber() @Min(0.1) @Max(6) minorRadius: number;
  @IsNumber() @Min(1) @Max(3) elongation: number;
  @IsNumber() @Min(0) @Max(0.7) triangularity: number;
  @IsNumber() @Min(0.01) @Max(0.5) scrapeOffLayer: number;
  @IsNumber() @Min(0.005) @Max(0.3) firstWallThickness: number;
  @IsNumber() @Min(0.02) @Max(2) blanketThickness: number;
  @IsNumber() @Min(0.02) @Max(1.5) shieldThickness: number;
  @IsNumber() @Min(0.02) @Max(1.5) vesselThickness: number;
  @IsNumber() @Min(0.01) @Max(1) vesselCoilGap: number;
  @IsNumber() @Min(0.05) @Max(3) tfCoilThickness: number;
  @IsInt() @Min(6) @Max(32) tfCoilCount: number;
}
