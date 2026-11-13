import { Controller, Get, Module } from '@nestjs/common';
import { REFERENCES } from './references.data';

@Controller('references')
export class ReferencesController {
  @Get()
  list() {
    return REFERENCES;
  }
}

@Module({ controllers: [ReferencesController] })
export class ReferencesModule {}
