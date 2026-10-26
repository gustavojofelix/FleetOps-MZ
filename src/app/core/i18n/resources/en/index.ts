import type { SourceTranslations } from '../pt-MZ';
import { TranslationOf } from '../../translation.types';
import { common } from './common';
import { customers } from './customers';
import { dashboard } from './dashboard';
import { dispatch } from './dispatch';
import { documents } from './documents';
import { drivers } from './drivers';
import { expenses } from './expenses';
import { fuel } from './fuel';
import { maintenance } from './maintenance';
import { navigation } from './navigation';
import { notifications } from './notifications';
import { profitability } from './profitability';
import { reports } from './reports';
import { search } from './search';
import { settings } from './settings';
import { countries, currencies, entities, validation } from './shared';
import { shell } from './shell';
import { trailers } from './trailers';
import { trips } from './trips';
import { users } from './users';
import { vehicles } from './vehicles';

export const translations: TranslationOf<SourceTranslations> = {
  common,
  navigation,
  shell,
  search,
  currencies,
  countries,
  entities,
  validation,
  dashboard,
  vehicles,
  drivers,
  trailers,
  customers,
  trips,
  dispatch,
  fuel,
  expenses,
  maintenance,
  profitability,
  reports,
  documents,
  notifications,
  users,
  settings,
};
