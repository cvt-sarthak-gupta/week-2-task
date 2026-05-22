export interface CreatePresetInput {
  name: string;
  filterAst: string;
  isShared: boolean;
}

export interface UpdatePresetInput {
  name?: string;
  filterAst?: string;
  isShared?: boolean;
  version: number;
  force?: boolean;
}
