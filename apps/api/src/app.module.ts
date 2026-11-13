import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';
import { PowerModule } from './power/power.module';
import { ReactorModule } from './reactor/reactor.module';
import { ReferencesModule } from './references/references.module';
import { SimulationModule } from './simulation/simulation.module';

@Module({
  imports: [
    // En production, l'API sert aussi le front compilé (apps/web/dist) : un seul service à déployer.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/(.*)'],
    }),
    ReactorModule,
    PowerModule,
    SimulationModule,
    ReferencesModule,
  ],
})
export class AppModule {}
