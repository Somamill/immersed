// Recover temporary failures automatically, but never repeatedly request audio
// after an explicit network/source denial or missing worker configuration.
const terminalReasons = new Set(['NETWORK_BLOCKED', 'SOURCE_RESTRICTED', 'SOURCE_ACCESS_DENIED', 'NOT_CONFIGURED', 'MEDIA_LIMIT']);
export function automaticRetryDelay(reason: string | undefined, attempt: number): number | undefined {
  if (reason && terminalReasons.has(reason)) return undefined;
  return [1500, 5000, 15000][attempt];
}
