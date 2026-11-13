import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { buildReactor, RadialBuildError } from './geometry';
import { PRESETS } from './presets';
import { ReactorModel, ReactorParams, ReactorPreset } from './reactor.types';

@Injectable()
export class ReactorService {
  listPresets(): ReactorPreset[] {
    return PRESETS;
  }

  buildPreset(id: string): ReactorModel {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) throw new NotFoundException(`Preset inconnu : ${id}`);
    return this.build(preset.params);
  }

  build(params: ReactorParams): ReactorModel {
    try {
      return buildReactor(params);
    } catch (err) {
      if (err instanceof RadialBuildError) throw new BadRequestException(err.message);
      throw err;
    }
  }
}
