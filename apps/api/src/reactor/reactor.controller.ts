import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ReactorParamsDto } from './dto/reactor-params.dto';
import { ReactorService } from './reactor.service';

@Controller('reactors')
export class ReactorController {
  constructor(private readonly reactors: ReactorService) {}

  /** Liste des machines types. */
  @Get('presets')
  presets() {
    return this.reactors.listPresets();
  }

  /** Modèle complet (profils, volumes, masses) d'une machine type. */
  @Get('presets/:id')
  preset(@Param('id') id: string) {
    return this.reactors.buildPreset(id);
  }

  /** Modèle complet à partir de paramètres libres. */
  @Post('build')
  @HttpCode(200)
  build(@Body() params: ReactorParamsDto) {
    return this.reactors.build(params);
  }
}
