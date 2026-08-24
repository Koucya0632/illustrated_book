export type MainWordExampleText = {
  en: string;
  ja: string;
  zh: string;
};

export type MainWordComplexExample = MainWordExampleText & {
  id: string;
};

export type MainWordSimpleExampleOverride = MainWordExampleText & {
  id: string;
};
