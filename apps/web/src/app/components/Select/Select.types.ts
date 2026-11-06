export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Options with the same group next to each other are listed under one heading. */
  group?: string;
}
