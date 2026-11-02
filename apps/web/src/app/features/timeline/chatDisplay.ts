export const CHAT_SCALE_VAR = '--wz-chat-scale';
export const CHAT_DENSITY_VAR = '--wz-chat-density';

export function chatSize(rem: number): string {
  return `calc(${rem}rem * var(${CHAT_SCALE_VAR}, 1))`;
}

export function chatSpace(px: number): string {
  return `calc(${px}px * var(${CHAT_DENSITY_VAR}, 1))`;
}
