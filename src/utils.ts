export function toCamelCase(str: string): string {
  return str.replace(/(-[a-z])/g, (_, part) => part[1].toUpperCase()).replaceAll("-", "");
}
