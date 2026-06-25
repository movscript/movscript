const ANSI_ESCAPE_SEQUENCE_PATTERN = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g
const ANSI_SGR_FRAGMENT_PATTERN = /\[(?:\d{1,3}(?:;\d{1,3})*)m/g

export function sanitizeAgentConnectionLogText(text: string): string {
  return text
    .replace(ANSI_ESCAPE_SEQUENCE_PATTERN, '')
    .replace(ANSI_SGR_FRAGMENT_PATTERN, '')
}
