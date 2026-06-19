import { Injectable } from '@nestjs/common';
import { LocalizationPack } from './localization.types';

@Injectable()
export class LocalizationRegistry {
  private readonly packs = new Map<string, LocalizationPack>();

  register(pack: LocalizationPack) {
    this.packs.set(pack.country, pack);
  }

  get(country: string): LocalizationPack | undefined {
    return this.packs.get(country);
  }

  list(): LocalizationPack[] {
    return Array.from(this.packs.values());
  }

  getSupportedCountries(): string[] {
    return Array.from(this.packs.keys());
  }
}
