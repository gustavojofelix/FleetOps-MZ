/** Vocabularies shared by several features. */
export const currencies = {
  MZN: 'Metical moçambicano',
  USD: 'Dólar norte-americano',
  ZAR: 'Rand sul-africano',
  ZWL: 'Dólar zimbabueano (histórico)',
};

export const countries = {
  MZ: 'Moçambique',
  ZW: 'Zimbabwe',
  MW: 'Malawi',
  ZM: 'Zâmbia',
  ZA: 'África do Sul',
};

export const entities = {
  vehicle: 'Viatura',
  driver: 'Motorista',
  trailer: 'Semi-reboque',
  trip: 'Viagem',
  customer: 'Cliente',
};

export const validation = {
  required: 'Campo obrigatório.',
  email: 'Introduza um endereço de e-mail válido.',
  min: 'O valor mínimo é {min}.',
  max: 'O valor máximo é {max}.',
  minLength: 'Introduza pelo menos {length} caracteres.',
  maxLength: 'Máximo de {length} caracteres.',
  pattern: 'Formato inválido.',
  positive: 'Introduza um valor superior a zero.',
  plate: 'Use o formato AAA-123-SF.',
  year: 'Introduza um ano entre {min} e {max}.',
  dateOrder: 'A data final deve ser posterior à data inicial.',
  phone: 'Introduza um número de telefone válido (ex.: +258 84 123 4567).',
  containerRef: 'Número de contentor inválido (ISO 6346, ex.: KUYU1234564).',
  formInvalid: 'Corrija os campos assinalados antes de guardar.',
};
