export const FunctionAttributeParser = {
  fromString(value: string): (event: Event) => void {
    return Function("event", value) as any;
  },
  intoString(value: (event: Event) => void): string {
    return `(${value.toString()})(event)`;
  },
};
