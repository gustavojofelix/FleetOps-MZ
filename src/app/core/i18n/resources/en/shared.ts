import type { countries as countriesSource, currencies as currenciesSource, entities as entitiesSource, validation as validationSource } from '../pt-MZ/shared';
import { TranslationOf } from '../../translation.types';

export const currencies: TranslationOf<typeof currenciesSource> = {
  MZN: 'Mozambican metical',
  USD: 'US dollar',
  ZAR: 'South African rand',
  ZWL: 'Zimbabwean dollar (historical)',
};

export const countries: TranslationOf<typeof countriesSource> = {
  MZ: 'Mozambique',
  ZW: 'Zimbabwe',
  MW: 'Malawi',
  ZM: 'Zambia',
  ZA: 'South Africa',
};

export const entities: TranslationOf<typeof entitiesSource> = {
  vehicle: 'Vehicle',
  driver: 'Driver',
  trailer: 'Trailer',
  trip: 'Trip',
  customer: 'Customer',
};

export const validation: TranslationOf<typeof validationSource> = {
  required: 'This field is required.',
  email: 'Enter a valid email address.',
  min: 'The minimum value is {min}.',
  max: 'The maximum value is {max}.',
  minLength: 'Enter at least {length} characters.',
  maxLength: 'Maximum {length} characters.',
  pattern: 'Invalid format.',
  positive: 'Enter a value greater than zero.',
  plate: 'Use the format AAA-123-SF.',
  year: 'Enter a year between {min} and {max}.',
  dateOrder: 'The end date must be after the start date.',
  phone: 'Enter a valid phone number (e.g. +258 84 123 4567).',
  containerRef: 'Invalid container number (ISO 6346, e.g. KUYU1234564).',
  formInvalid: 'Fix the highlighted fields before saving.',
};
